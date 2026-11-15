"use strict";
const crypto = require("node:crypto");

function readUInt24BE(b, o) { return (b[o] << 16) | (b[o+1] << 8) | b[o+2]; }
function imageInfo(b) {
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {format:"PNG",width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if (b.length >= 10 && (b.toString("ascii",0,6)==="GIF87a" || b.toString("ascii",0,6)==="GIF89a")) return {format:"GIF",width:b.readUInt16LE(6),height:b.readUInt16LE(8)};
  if (b.length >= 30 && b.toString("ascii",0,4)==="RIFF" && b.toString("ascii",8,12)==="WEBP") return {format:"WebP",width:null,height:null,dimensions:"requires VP8 chunk parser"};
  if (b.length > 4 && b[0]===0xff && b[1]===0xd8) {
    let o=2;
    while(o+4<b.length) {
      if(b[o]!==0xff){o++;continue;}
      const marker=b[o+1], len=b.readUInt16BE(o+2);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && o+9<b.length) return {format:"JPEG",height:b.readUInt16BE(o+5),width:b.readUInt16BE(o+7)};
      if(len<2) break; o+=2+len;
    }
    return {format:"JPEG",dimensions:"not found in scanned header"};
  }
  return null;
}
function audioInfo(b) {
  if(b.length>=44 && b.toString("ascii",0,4)==="RIFF" && b.toString("ascii",8,12)==="WAVE") {
    let o=12, rate=null, channels=null, bits=null, dataSize=null;
    while(o+8<=b.length) {
      const id=b.toString("ascii",o,o+4), size=b.readUInt32LE(o+4);
      if(id==="fmt " && o+24<=b.length){channels=b.readUInt16LE(o+10);rate=b.readUInt32LE(o+12);bits=b.readUInt16LE(o+22);}
      if(id==="data"){dataSize=size;break;}
      o+=8+size+(size%2);
    }
    return {format:"WAV",channels,sampleRate:rate,bitsPerSample:bits,dataBytes:dataSize};
  }
  if(b.length>=10 && b.toString("ascii",0,3)==="ID3") return {format:"MP3/ID3",id3Version:b[3]+"."+b[4],tagBytes:((b[6]&127)<<21)|((b[7]&127)<<14)|((b[8]&127)<<7)|(b[9]&127)};
  if(b.length>=2 && b[0]===0xff && (b[1]&0xe0)===0xe0) return {format:"MP3 frame",header:"MPEG audio sync detected"};
  return null;
}
function inspectAsset(buffer) {
  const hash=crypto.createHash("sha256").update(buffer).digest("hex");
  const image=imageInfo(buffer), audio=audioInfo(buffer);
  return {sha256:hash,bytes:buffer.length,kind:image?"image":audio?"audio":"unknown/binary",metadata:image||audio||{},headerHex:buffer.subarray(0,32).toString("hex")};
}
module.exports={inspectAsset,imageInfo,audioInfo};
