function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents)
    var to = payload.to
    var subject = payload.subject
    var body = payload.body

    if (!to || !subject || !body) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Missing fields' }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    GmailApp.sendEmail(to, subject, body, {
      name: 'Mantto Piazza',
      replyTo: 'pablo.aranda@piazza-pasticcio.com'
    })

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'email-relay' }))
    .setMimeType(ContentService.MimeType.JSON)
}
