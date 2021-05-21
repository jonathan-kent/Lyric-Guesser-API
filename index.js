const express = require('express');
const cors = require('cors');
const monk = require('monk');
const Filter = require('bad-words');

const app = express();

const db = monk(process.env.MONGO_URI || 'localhost/pop_lyrics');
const comps = db.get('comparisons');
const songs = db.get('songs');
const filter = new Filter();

app.use(cors());
app.use(express.json());

const PORT = 5000;

app.get('/', (req, res) => {
  res.json({
    message: "lyric guess"
  });
});

app.get('/comps', (req, res, next) => {
  comps.aggregate([{$sample: {size: 1}}])
  .then (comp => {
    res.json(comp)
  }).catch(next);
});

// receive a vote
// query for comparison
//  if it exists: update the votes of the match with pick
//  does not exist: create new document with one vote for the match with pick
// return query results for words
app.post('/votes', (req, res) => {
  const w1 = req.body.w1.toString().toLowerCase();
  const w2 = req.body.w2.toString().toLowerCase();
  const pick = req.body.pick.toString().toLowerCase();
  var isPublic = req.body.isPublic;
  if (isPublic) {
    cleanW1 = filter.clean(w1);
    cleanW2 = filter.clean(w2);
    if (cleanW1 != w1 || cleanW2 != w2) isPublic = false;
  }
  var exists = true;
  comps.findOne({"w1.word": w1, "w2.word": w2})
    .then( (doc) => {
      if (pick == w1) {
        if (doc) comps.update({"_id": doc._id}, {$set: {"w1.votes": ++doc.w1.votes} });
        else if (isPublic) exists = false;
      }
      else {
        if (doc) comps.update({"_id": doc._id}, {$set: {"w2.votes": ++doc.w2.votes} });
        else if (isPublic) exists = false;
      }
    })
    .then( async () => {
      const w1Data = await songs.aggregate([ {$match: {$and: [{lyrics: new RegExp(","+w1+",")}, {lyrics: {$not: new RegExp(","+w2+",")} }]}}, {$group: {_id: null, "songs": {$push: "$$ROOT"}, "count": {$sum: 1}}}, {$project: {_id: 0, "count": 1, "songs": {title: 1, artist: 1}}} ]);
      const w2Data = await songs.aggregate([ {$match: {$and: [{lyrics: new RegExp(","+w2+",")}, {lyrics: {$not: new RegExp(","+w1+",")} }]}}, {$group: {_id: null, "songs": {$push: "$$ROOT"}, "count": {$sum: 1}}}, {$project: {_id: 0, "count": 1, "songs": {title: 1, artist: 1}}} ])
      if (w1Data && w2Data && !exists) {
        if (pick == w1) await comps.insert({"w1": {"word": w1, "votes": 1}, "w2": {"word": w2, "votes": 0}});
        else await comps.insert({"w1": {"word": w1, "votes": 0}, "w2": {"word": w2, "votes": 1}});
      }
      const unionData = await songs.aggregate([ {$match: {$and: [{lyrics: new RegExp(","+w1+",")}, {lyrics: new RegExp(","+w2+",") }]}}, {$group: {_id: null, "songs": {$push: "$$ROOT"}, "count": {$sum: 1}}}, {$project: {_id: 0, "count": 1, "songs": {title: 1, artist: 1}}} ]);
      const voteData = await comps.findOne({"w1.word": w1, "w2.word": w2}, {"_id": 0, "w1.votes": 1, "w2.votes": 1});

      const result = {
        w1Data,
        w2Data,
        unionData,
        voteData
      };
      res.json(result);
    });
});

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
