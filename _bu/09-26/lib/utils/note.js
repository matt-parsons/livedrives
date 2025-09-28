const events = [];
function note(msg, img = null) {
  console.log(msg, img ?? '');
  events.push({ msg, img });
}
function getEvents() { return events; }
module.exports = { note, getEvents };
