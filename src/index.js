require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const {
  Client, GatewayIntentBits, ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");

const { DISCORD_TOKEN } = process.env;
const CURRENCY = process.env.STORE_CURRENCY || "DZD";
if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is missing. Configure it in the host environment.");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "store.json");
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ products: [], orders: [] }, null, 2));

function readData() {
  try { return JSON.parse(fs.readFileSync(dataFile, "utf8")); }
  catch { return { products: [], orders: [] }; }
}
function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2)); }
function staff(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "customer";
}
function findNamedChannel(guild, plainName, type) {
  return guild.channels.cache.find(c => c.type === type && c.name.includes(plainName));
}
const categoryLabels = {
  "WELCOME": "📌・WELCOME",
  "STORE": "🛍️・STORE",
  "CUSTOMER SERVICE": "🎫・CUSTOMER-SERVICE",
  "STAFF": "🛠️・STAFF"
};
const channelLabels = {
  "welcome": "👋・welcome",
  "rules": "📜・rules",
  "announcements": "📢・announcements",
  "store-catalog": "🛍️・store-catalog",
  "open-ticket": "🎫・open-ticket",
  "customer-reviews": "⭐・customer-reviews",
  "payment-info": "💳・payment-info",
  "orders-log": "🧾・orders-log",
  "stock-management": "📦・stock-management"
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => console.log(`Tera Store online: ${client.user.tag}`));

async function openTicket(interaction, reason) {
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: "Use this command inside the store server.", ephemeral: true });
  const existing = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && c.topic?.includes(`tera-owner:${interaction.user.id}`)
  );
  if (existing) return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });

  const support = guild.roles.cache.find(r => ["Support", "Admin", "Owner"].includes(r.name));
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes("CUSTOMER"));
  const channel = await guild.channels.create({
    name: `ticket-${slug(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: `tera-owner:${interaction.user.id} | ${reason.slice(0, 120)}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(support ? [{ id: support.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });
  await channel.send(`Hello <@${interaction.user.id}>. Tera Store support will help you here.\nReason: ${reason}\nNever share passwords, 2FA codes, or recovery codes.`);
  return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "tera_ticket_open") {
        await openTicket(interaction, "Support panel request");
        return;
      }
      if (interaction.customId.startsWith("tera_order_confirm:") || interaction.customId.startsWith("tera_order_reject:")) {
        if (!staff(interaction)) return interaction.reply({ content: "هذا الإجراء مخصص للإدارة فقط.", ephemeral: true });
        const [action, orderId] = interaction.customId.replace("tera_order_", "").split(":");
        const data = readData();
        const order = data.orders.find(o => o.id === orderId);
        if (!order || order.status !== "awaiting_payment_review") return interaction.reply({ content: "الطلب غير موجود أو تمت معالجته مسبقاً.", ephemeral: true });
        const product = data.products.find(p => p.id === order.productId);
        if (action === "confirm") {
          if (!product || product.stock < order.quantity) return interaction.reply({ content: "المخزون غير كافٍ لتأكيد هذا الطلب.", ephemeral: true });
          product.stock -= order.quantity;
          order.status = "confirmed";
          order.confirmedAt = new Date().toISOString();
          order.confirmedBy = interaction.user.id;
        } else {
          order.status = "rejected";
          order.rejectedAt = new Date().toISOString();
          order.rejectedBy = interaction.user.id;
        }
        writeData(data);
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tera_done_confirm").setLabel(action === "confirm" ? "تم التأكيد" : "رُفض الطلب").setStyle(action === "confirm" ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(true)
        );
        await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
        const customer = await client.users.fetch(order.userId).catch(() => null);
        if (customer) await customer.send(action === "confirm"
          ? `✅ تم تأكيد الدفع للطلب ${order.id}. سيتواصل معك فريق Tera لتسليم المنتج.`
          : `❌ تم رفض الطلب ${order.id}. يرجى مراجعة تذكرة الدعم.`).catch(() => {});
        return interaction.reply({ content: action === "confirm" ? `تم تأكيد الطلب ${order.id} وخصم الكمية من المخزون.` : `تم رفض الطلب ${order.id}.`, ephemeral: true });
      }
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "tera_product_select") {
      const productId = interaction.values[0];
      const data = readData();
      const product = data.products.find(p => p.id === productId && p.active);
      if (!product || product.stock < 1) return interaction.reply({ content: "المنتج غير متوفر حالياً.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`tera_checkout:${product.id}`).setTitle("إتمام طلب Tera Store");
      const quantity = new TextInputBuilder().setCustomId("quantity").setLabel("الكمية المطلوبة").setStyle(TextInputStyle.Short).setPlaceholder("1").setValue("1").setRequired(true).setMaxLength(3);
      modal.addComponents(new ActionRowBuilder().addComponents(quantity));
      return interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("tera_checkout:")) {
      const productId = interaction.customId.split(":")[1];
      const quantity = Number.parseInt(interaction.fields.getTextInputValue("quantity"), 10);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return interaction.reply({ content: "أدخل كمية صحيحة بين 1 و99.", ephemeral: true });
      const data = readData();
      const product = data.products.find(p => p.id === productId && p.active);
      if (!product || product.stock < quantity) return interaction.reply({ content: "الكمية المطلوبة غير متوفرة حالياً.", ephemeral: true });
      const pending = data.orders.filter(o => o.productId === productId && ["awaiting_payment_review", "pending_manual_confirmation"].includes(o.status)).reduce((sum, o) => sum + o.quantity, 0);
      if (product.stock - pending < quantity) return interaction.reply({ content: "هناك طلبات أخرى تنتظر الدفع؛ الكمية المتاحة حالياً أقل من طلبك. تواصل مع الدعم.", ephemeral: true });
      const order = {
        id: `TS-${Date.now().toString(36).toUpperCase()}`, userId: interaction.user.id,
        productId, product: product.name, quantity, total: product.price * quantity,
        status: "awaiting_payment_review", createdAt: new Date().toISOString()
      };
      data.orders.push(order);
      writeData(data);
      const category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes("CUSTOMER"));
      const supportRoles = interaction.guild.roles.cache.filter(r => ["Support", "Admin", "Owner"].includes(r.name));
      const channel = await interaction.guild.channels.create({
        name: `order-${order.id.toLowerCase().replace(/[^a-z0-9-]/g, "")}`,
        type: ChannelType.GuildText, parent: category?.id,
        topic: `tera-order:${order.id} | tera-owner:${interaction.user.id}`,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
          ...supportRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
        ]
      });
      const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle("🧾 TERA STORE — ملخص الطلب")
        .setDescription(`مرحباً <@${interaction.user.id}>، تم إنشاء طلبك بنجاح.\n\n**رقم الطلب:** ${order.id}\n**المنتج:** ${product.name}\n**الكمية:** ${quantity}\n**سعر الوحدة:** ${product.price.toLocaleString("en-US")} ${CURRENCY}\n**الإجمالي:** ${order.total.toLocaleString("en-US")} ${CURRENCY}\n**الحالة:** ⏳ بانتظار إثبات الدفع ومراجعة الإدارة\n\nأرسل إثبات الدفع هنا. لا ترسل كلمات المرور أو رموز التحقق.`);
      const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tera_order_confirm:${order.id}`).setLabel("تأكيد الدفع").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tera_order_reject:${order.id}`).setLabel("رفض الطلب").setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: `<@${interaction.user.id}> ${supportRoles.map(r => `<@&${r.id}>`).join(" ")}`, embeds: [embed], components: [actions] });
      const log = interaction.guild.channels.cache.find(c => c.name.includes("orders-log") && c.isTextBased());
      if (log) await log.send(`🛒 طلب جديد **${order.id}** من <@${interaction.user.id}> — ${product.name} × ${quantity} — **${order.total.toLocaleString("en-US")} ${CURRENCY}**`);
      return interaction.reply({ content: `✅ تم إنشاء طلبك **${order.id}**. أكمل الدفع وأرسل الإثبات في تذكرتك الخاصة: ${channel}`, ephemeral: true });
    }
    if (!interaction.isChatInputCommand()) return;

    const data = readData();
    const command = interaction.commandName;

    if (command === "setup") {
      if (!staff(interaction)) return interaction.reply({ content: "Admin only.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      const categoryNames = ["WELCOME", "STORE", "CUSTOMER SERVICE", "STAFF"];
      for (const name of categoryNames) {
        const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes(name.split(" ")[0]));
        if (existing) {
          if (existing.name !== categoryLabels[name]) await existing.setName(categoryLabels[name]);
        } else {
          await guild.channels.create({ name: categoryLabels[name], type: ChannelType.GuildCategory });
        }
      }
      await guild.roles.fetch();
      const roles = [
        { name: "Owner", color: 0x8b5cf6, permissions: [PermissionFlagsBits.Administrator] },
        { name: "Admin", color: 0xef4444, permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
        { name: "Support", color: 0x3b82f6, permissions: [PermissionFlagsBits.ManageMessages] },
        { name: "Customer", color: 0x22c55e, permissions: [] }
      ];
      for (const role of roles) {
        if (!guild.roles.cache.find(r => r.name === role.name))
          await guild.roles.create({ ...role, reason: "Tera Store initial setup" });
      }
      const specs = [
        ["welcome", "WELCOME"], ["rules", "WELCOME"], ["announcements", "WELCOME"],
        ["store-catalog", "STORE"], ["open-ticket", "CUSTOMER SERVICE"],
        ["customer-reviews", "CUSTOMER SERVICE"], ["payment-info", "CUSTOMER SERVICE"],
        ["orders-log", "STAFF"], ["stock-management", "STAFF"]
      ];
      for (const [name, categoryName] of specs) {
        const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.includes(name));
        const parent = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes(categoryName.split(" ")[0]));
        if (existing) {
          if (existing.name !== channelLabels[name]) await existing.setName(channelLabels[name]);
          if (parent && existing.parentId !== parent.id) await existing.setParent(parent.id);
        } else {
          await guild.channels.create({ name: channelLabels[name], type: ChannelType.GuildText, parent: parent?.id });
        }
      }
      return interaction.editReply("✨ Tera Store layout updated! Categories, channels and product areas now have matching emojis.");
    }

    if (command === "panel") {
      const embed = new EmbedBuilder().setColor(0x8b5cf6)
        .setTitle("🎧 Tera Store — Customer Support")
        .setDescription("🎫 Press the button to open a private support ticket.\n🔒 Never send passwords or verification codes.");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("tera_ticket_open").setLabel("🎫 Open a ticket").setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (command === "ticket") return openTicket(interaction, interaction.options.getString("reason") || "Customer support request");

    if (command === "product") {
      const sub = interaction.options.getSubcommand();
      if (sub === "image") {
        if (!staff(interaction)) return interaction.reply({ content: "Staff only.", ephemeral: true });
        const productName = interaction.options.getString("product").trim();
        const imageUrl = interaction.options.getString("image_url").trim();
        if (!/^https:\/\//i.test(imageUrl)) return interaction.reply({ content: "رابط الصورة يجب أن يبدأ بـ https://", ephemeral: true });
        const product = data.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
        if (!product) return interaction.reply({ content: "Product not found.", ephemeral: true });
        product.imageUrl = imageUrl;
        writeData(data);
        return interaction.reply({ content: `تم تحديث صورة **${product.name}**.`, ephemeral: true });
      }
      if (sub === "add") {
        if (!staff(interaction)) return interaction.reply({ content: "Staff only.", ephemeral: true });
        const name = interaction.options.getString("name").trim();
        const price = interaction.options.getInteger("price");
        const description = interaction.options.getString("description") || "No description.";
        const imageUrl = interaction.options.getString("image_url");
        if (imageUrl && !/^https:\/\//i.test(imageUrl)) return interaction.reply({ content: "رابط الصورة يجب أن يبدأ بـ https://", ephemeral: true });
        if (data.products.some(p => p.name.toLowerCase() === name.toLowerCase()))
          return interaction.reply({ content: "A product with that name already exists.", ephemeral: true });
        data.products.push({ id: Date.now().toString(36), name, price, description, imageUrl: imageUrl || null, stock: 0, active: true });
        writeData(data);
        return interaction.reply({ content: `Added **${name}** — ${price.toLocaleString("en-US")} ${CURRENCY}. Stock starts at zero.`, ephemeral: true });
      }
      const products = data.products.filter(p => p.active).slice(0, 25);
      if (!products.length) return interaction.reply({ content: "لا توجد منتجات معروضة حالياً.", ephemeral: true });
      const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle("🛍️ TERA STORE — PRODUCT LIST")
        .setDescription("اختر المنتج من القائمة بالأسفل لعرض طلبك.")
        .addFields(products.map(p => ({
          name: `${p.name.toUpperCase()} | ${p.price.toLocaleString("en-US")} ${CURRENCY}`.slice(0, 256),
          value: `>>> **${p.stock > 0 ? `${String(p.stock).padStart(2, "0")} AVAILABLE` : "OUT OF STOCK"}**\n${p.description || "No description."}`.slice(0, 1024),
          inline: false
        })));
      const catalogImage = products.find(p => p.imageUrl && /^https:\/\//i.test(p.imageUrl))?.imageUrl;
      if (catalogImage) embed.setThumbnail(catalogImage);
      const menu = new StringSelectMenuBuilder().setCustomId("tera_product_select")
        .setPlaceholder("🛒 اختر منتجاً للشراء")
        .addOptions(products.map(p => ({ label: p.name.slice(0, 100), description: `${p.price.toLocaleString("en-US")} ${CURRENCY} • المخزون ${p.stock}`.slice(0, 100), value: p.id, emoji: p.stock > 0 ? "🟢" : "🔴", default: false })));
      return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    if (command === "stock") {
      if (!staff(interaction)) return interaction.reply({ content: "Staff only.", ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === "list") {
        const lines = data.products.map(p => `• ${p.name}: ${p.stock}`);
        return interaction.reply({ content: lines.join("\n") || "No products.", ephemeral: true });
      }
      const name = interaction.options.getString("product");
      const quantity = interaction.options.getInteger("quantity");
      const product = data.products.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!product) return interaction.reply({ content: "Product not found.", ephemeral: true });
      if (sub === "set") product.stock = quantity;
      if (sub === "add") product.stock += quantity;
      if (sub === "remove") {
        if (product.stock < quantity) return interaction.reply({ content: "Not enough stock.", ephemeral: true });
        product.stock -= quantity;
      }
      writeData(data);
      return interaction.reply({ content: `Stock for **${product.name}** is now **${product.stock}**.`, ephemeral: true });
    }

    if (command === "order") {
      const sub = interaction.options.getSubcommand();
      if (sub === "manage") {
        if (!staff(interaction)) return interaction.reply({ content: "Staff only. Verify payment independently before confirming.", ephemeral: true });
        const orderId = interaction.options.getString("order_id").trim().toUpperCase();
        const action = interaction.options.getString("action");
        const order = data.orders.find(o => o.id.toUpperCase() === orderId);
        if (!order) return interaction.reply({ content: "Order ID not found.", ephemeral: true });
        if (order.status !== "pending_manual_confirmation") {
          return interaction.reply({ content: `This order is already ${order.status}.`, ephemeral: true });
        }
        if (action === "confirm") {
          const product = data.products.find(p => p.id === order.productId || p.name.toLowerCase() === order.product.toLowerCase());
          if (!product || product.stock < order.quantity) {
            return interaction.reply({ content: "Cannot confirm: product missing or stock is now insufficient.", ephemeral: true });
          }
          product.stock -= order.quantity;
          order.status = "confirmed";
          order.confirmedAt = new Date().toISOString();
          order.confirmedBy = interaction.user.id;
        } else {
          order.status = "rejected";
          order.rejectedAt = new Date().toISOString();
          order.rejectedBy = interaction.user.id;
        }
        writeData(data);
        const customer = await client.users.fetch(order.userId).catch(() => null);
        if (customer) {
          await customer.send(action === "confirm"
            ? `Your Tera Store order **${order.id}** has been confirmed. Staff will arrange fulfillment.`
            : `Your Tera Store order **${order.id}** was rejected. Please open a ticket if you need help.`
          ).catch(() => {});
        }
        const log = interaction.guild.channels.cache.find(c => c.name.includes("orders-log") && c.isTextBased());
        if (log) await log.send(`Order **${order.id}** status changed to **${order.status}** by <@${interaction.user.id}>.`);
        return interaction.reply({ content: `Order **${order.id}** marked **${order.status}**.`, ephemeral: true });
      }
      const name = interaction.options.getString("product");
      const quantity = interaction.options.getInteger("quantity");
      const product = data.products.find(p => p.name.toLowerCase() === name.toLowerCase() && p.active);
      if (!product) return interaction.reply({ content: "Product not found.", ephemeral: true });
      if (product.stock < quantity) return interaction.reply({ content: "Insufficient stock. Open a ticket to ask staff.", ephemeral: true });
      const order = {
        id: `TS-${Date.now().toString(36).toUpperCase()}`,
        userId: interaction.user.id, productId: product.id, product: product.name, quantity,
        total: product.price * quantity, status: "pending_manual_confirmation",
        createdAt: new Date().toISOString()
      };
      data.orders.push(order);
      writeData(data);
      const log = interaction.guild.channels.cache.find(c => c.name === "orders-log" && c.isTextBased());
      if (log) await log.send(`New order **${order.id}** from <@${interaction.user.id}>\n**${product.name}** × ${quantity}\nTotal: **${order.total.toLocaleString("en-US")} ${CURRENCY}**\nStatus: Pending manual confirmation.`);
      return interaction.reply({ content: `Order **${order.id}** recorded. Total: **${order.total.toLocaleString("en-US")} ${CURRENCY}**. Payment and fulfillment require staff confirmation.`, ephemeral: true });
    }
  } catch (error) {
    console.error("Interaction error:", error);
    const msg = "Something went wrong. Please try again or open a support ticket.";
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
