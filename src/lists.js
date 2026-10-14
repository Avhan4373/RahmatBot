import {
  generateWAMessageFromContent,
  proto,
} from '@whiskeysockets/baileys';

// Tombol model SC UMKM: LIST MESSAGE persis seperti referensi
// (wileys 0.7.8: { text->description, buttonText, sections, footer->footerText }).
// Baileys resmi v6 menghapus generatornya, tapi PROTO ListMessage masih ada,
// jadi kita bangun sendiri lalu relay — hasil di HP identik dengan SC.
// rows: [{ rowId, title, description }]

// Node biner WAJIB agar tombol dirender HP (temuan dari @ryuu-reinzz/button-helper,
// yang mereplika itsukichan): tanpa additionalNodes ini, server menerima stanza
// (terkadang ACK) tapi klien tidak menampilkan tombol.
// - interactive (quick_reply/single_select): biz{native_flow mixed} + bot{biz_bot}
// - listMessage: biz{list product_list} + bot{biz_bot}
const isPrivateChat = (jid) => !jid.endsWith('@g.us') && jid !== 'status@broadcast';
const botNode = { tag: 'bot', attrs: { biz_bot: '1' } };
const nativeFlowBizNode = {
  tag: 'biz', attrs: {},
  content: [{
    tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
  }],
};
const listBizNode = {
  tag: 'biz', attrs: {},
  content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }],
};
const nodesFor = (jid, kind) => {
  const nodes = [kind === 'list' ? listBizNode : nativeFlowBizNode];
  // Node `bot` hanya untuk chat pribadi. Tombol/list tidak didukung di grup
  // (server menolak error 479), jadi grup memakai teks biasa — lihat group.js.
  if (isPrivateChat(jid)) nodes.push(botNode);
  return nodes;
};

async function relayWithNodes(sock, jid, waMsg) {
  await sock.relayMessage(jid, waMsg.message, {
    messageId: waMsg.key.id,
    additionalNodes: nodesFor(jid, waMsg.message.interactiveMessage ? 'interactive' : 'list'),
  });
}

export async function sendListMessage(sock, jid, { text, buttonText, footer = '', title = '', sections }, quoted) {
  // Susun field persis seperti SC (wileys): field kosong DIHILANGKAN agar
  // byte yang terkirim identik — server WA bisa menolak payload ber-field kosong.
  const listMessage = {
    description: text,
    buttonText,
    listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
    sections: sections.map(s => ({
      title: s.title,
      rows: s.rows.map(r => ({
        rowId: r.rowId,
        title: r.title,
        description: r.description || '',
      })),
    })),
  };
  if (title) listMessage.title = title;
  if (footer) listMessage.footerText = footer;
  const waMsg = generateWAMessageFromContent(jid, { listMessage }, { userJid: sock.user?.id, quoted });
  await relayWithNodes(sock, jid, waMsg);
}

// Tombol QUICK REPLY (nativeFlow) — maks 3 per pesan (batas WhatsApp).
// Ini jalur tombol yang masih didukung resmi (pengganti buttons/list mati).
export async function sendQuickReplies(sock, jid, { text, footer = '', buttons }, quoted) {
  const chunks = [];
  for (let i = 0; i < buttons.length; i += 3) chunks.push(buttons.slice(i, i + 3));
  for (const [ci, part] of chunks.entries()) {
    const waMsg = generateWAMessageFromContent(jid, {
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: ci === 0 ? text : `(lanjutan ${ci + 1}) Pilih:` }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: part.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.display, id: b.id }),
          })),
        }),
      }),
    }, { userJid: sock.user?.id, quoted });
    await relayWithNodes(sock, jid, waMsg);
  }
}

// Kirim list; gagal → fallback teks bernomor (user tetap bisa ketik perintah).
export async function sendList(sock, jid, listObj, quoted) {
  try {
    return await sendListMessage(sock, jid, listObj, quoted);
  } catch (e) {
    console.error('[list] gagal, fallback teks:', e.message);
    return await sock.sendMessage(jid, { text: listObj.fallback || listObj.text });
  }
}
