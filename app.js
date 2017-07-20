const mongoose = require('mongoose');
const productHuntAPI = require('producthunt');
const rateLimiter = require('limiter').RateLimiter;
const yaml = require('js-yaml');
const fs = require('fs');
const async = require('async');
const mongooseToCsv = require('mongoose-to-csv');

mongoose.connect('mongodb://localhost/productHuntUsers', { useMongoClient: true });

const Schema = mongoose.Schema;

const userSchema = new Schema({
  FullName: String,
  ProductHuntProfileUrl: String,
  TwitterUrl: String,
  BioDesc: String,
  Followers: Number,
  Url: String,
  id: Number
});

userSchema.plugin(mongooseToCsv, {
  headers: 'FullName ProductHuntProfileUrl TwitterUrl BioDesc Followers Url',
  virtuals: {
    'BioDesc': function (doc) {
      return `"${doc.BioDesc}"`;
    },
    'ProductHuntProfileUrl': function (doc) {
      return `"${doc.ProductHuntProfileUrl}"`;
    },
    'TwitterUrl': function (doc) {
      return `"${doc.TwitterUrl}"`;
    },
    'Followers': function (doc) {
      return `"${doc.Followers}"`;
    },
    'Url': function (doc) {
      return `"${doc.Url}"`;
    },
    'FullName': function (doc) {
      return `"${doc.FullName}"`;
    }
  }
});

const userTables = [];

let productHunt = new productHuntAPI({
  client_id: '90c2e7df46f59b3f4f46d4bce5543e270736b7396bff7475c68520d58426ab6c',
  client_secret: '0259bbceb0415e426e769b8da874c92bee61a9245eb28bf82db92ea8d89dd458',
  grant_type: 'client_credentials'
});

let limiter = new rateLimiter(50, 'minute');

let postsUrls = [];

function getPosts (cb) {
  // Load posts urls from file
  console.log('Load posts urls from file');
  try {
    const config = yaml.safeLoad(fs.readFileSync(process.argv[2], 'utf8'));
    postsUrls = config.list.map((item) => {
      const split = item.split('/');
      userTables.push(mongoose.model(split[split.length - 1], userSchema));
      return split[split.length - 1]
    });
  } catch (err) {
    console.error('Unable to open file: ', err);
    return cb(err);
  }
  // Load posts from API
  console.log('Load posts from API');
  async.map(postsUrls, (url, mapCb) => {
    limiter.removeTokens(1, () => {
      productHunt.posts.show({ id: url }, (err, response) => {
        if (err) {
          console.error(`Unable to fetch post (${url}): `, err);
          return mapCb(err);
        }
        mapCb(null, { id: JSON.parse(response.body).post.id, url });
      });
    })
  }, (err, postsData) => {
    cb(err, postsData);
  });
}

function getVotes (postsData, cb) {
  // Load posts upvoters
  console.log('Load posts upvoters');
  async.map(postsData, (data, mapCb) => {
    let upvoters = [];
    let older = null;

    async.whilst(
      () => older !== 0,
      (cb) => {
        limiter.removeTokens(1, () => {
          productHunt.votes.index({ post_id: data.id, params: { older } }, (err, response) => {
            if (err) {
              console.error(`Unable to fetch post votes (${id})`, err);
              return cb(err);
            }
            let votes = [];
            try {
               votes = JSON.parse(response.body).votes;
            } catch (err) {
              console.error(`Server returns invalid data, please, restart script: `, err);
              return cb(err);
            }
            upvoters = upvoters.concat(votes.map((vote) => {
              return { id: vote.user.id, post: data.url }
            }));
            if (votes && votes.length) {
              older = votes[votes.length - 1].id;
            } else {
              older = 0;
            }
            cb(null, older);
          });
        });
      },
      (err, last) => {
        return mapCb(err, upvoters);
      }
    )
  }, (err, upvoters) => {
    cb(err, upvoters);
  })
}

function getUsers (upvoters, cb) {
  // Load upvoters users and add into database
  console.log('Load upvoters users');
  async.each(upvoters, (userInfo, eachCb) => {
    const index = postsUrls.findIndex((url) => url === userInfo.post);
    const userModel = userTables[index];

    userModel.findOne({ id: userInfo.id }, (err, user) => {
      if (err) {
        return eachCb(err);
      }
      if (!user) {
        limiter.removeTokens(1, () => {
          productHunt.users.show({ id: userInfo.id }, (err, response) => {
            if (err) {
              console.error(`Unable to fetch user (${userInfo.id}): `, err);
              return eachCb(err);
            }
            let requestedUser;
            try {
              requestedUser = JSON.parse(response.body).user;
            } catch (err) {
              console.error(`Server returns invalid data, please, restart script: `, err);
              return eachCb(err);
            }

            const userForModel = {
              FullName: requestedUser.name,
              ProductHuntProfileUrl: requestedUser.profile_url,
              TwitterUrl: ` https://twitter.com/${requestedUser.twitter_username}`,
              BioDesc: requestedUser.headline,
              Followers: requestedUser.followers_count,
              Url: requestedUser.website_url,
              id: requestedUser.id
            };
            const newUser = userModel(userForModel);
            userModel.create(newUser, (err, user) => {
              if (err) {
                console.error('Unable to create new user', err);
                return eachCb(err);
              }
              eachCb();
            });
          });
        });
      } else {
        eachCb();
      }
    });
  }, (err) => {
    cb(err);
  });
}

function toCsv (cb) {
  console.log('Export to csv');
  async.each(postsUrls, (url, eachCB) => {
    const index = postsUrls.findIndex((post) => url === post);
    const userModel = userTables[index];
    userModel.findAndStreamCsv().pipe(fs.createWriteStream(`${url}.csv`));
  }, (err) => {
    cb(err);
  });
}

getPosts((err, postsData) => {
  if (err) {
    console.error('Unable to load posts: ', err)
  } else {
    console.log('Posts were loaded');
    getVotes(postsData, (err, upvoters) => {
      if (err) {
        console.error('Unable to load upvoters: ', err)
      } else {
        console.log('Posts upvoters were loaded');
        let upvotersArray = [];
        upvoters.forEach((arr) => upvotersArray = upvotersArray.concat(arr));
        getUsers(upvotersArray, (err) => {
          if (err) {
            console.error('Unable to  load users: ', err);
          } else {
            console.log('Users were loaded and added to database');
            toCsv((err) => {
              if (err) {
                console.log('Unable to export to csv: ', err);
                process.exit();
              } else {
                console.log('Data was exported');
                process.exit();
              }
            });
          }
        })
      }
    })
  }
});
