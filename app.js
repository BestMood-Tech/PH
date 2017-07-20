const mongoose = require('mongoose');
const productHuntAPI = require('producthunt');
const rateLimiter = require('limiter').RateLimiter;
const yaml = require('js-yaml');
const fs = require('fs');

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

const UserClearbitConnect = mongoose.model('UserClearbitConnect', userSchema);
const UserEmailHunter = mongoose.model('UserEmailHunter', userSchema);
const UserElucify3 = mongoose.model('UserElucify3', userSchema);
const UserThrust = mongoose.model('UserThrust', userSchema);
const UserSlikProspector = mongoose.model('UserSlikProspector', userSchema);
const UserTemplatesForGmail = mongoose.model('UserTemplatesForGmail', userSchema);
const UserEmailMatcher = mongoose.model('UserEmailMatcher', userSchema);
const UserViolaNorbert = mongoose.model('UserViolaNorbert', userSchema);

let productHunt = new productHuntAPI({
  client_id: '90c2e7df46f59b3f4f46d4bce5543e270736b7396bff7475c68520d58426ab6c',
  client_secret: '0259bbceb0415e426e769b8da874c92bee61a9245eb28bf82db92ea8d89dd458',
  grant_type: 'client_credentials'
});

let limiter = new rateLimiter(60, 'minute');

let postsUrls = [];

function getPosts () {
  try {
    const config = yaml.safeLoad(fs.readFileSync(process.argv[2], 'utf8'));
    postsUrls = config.list.map((item) => {
      const split = item.split('/');
      return split[item.split('/').length - 1]
    });
  } catch (err) {
    console.error('Unable to open file: ', err);
    return;
  }
  postsUrls.forEach((url) => {
    // Fetch post from API
    productHunt.posts.show({ id: url }, (err, response) => {
      if (err) {
        console.error(`Unable to fetch post (${url}): `, err);
        return;
      }
      const id = JSON.parse(response.body).post.id;
      console.log(id, JSON.parse(response.body).post.name, JSON.parse(response.body).post.votes_count);
      limiter.removeTokens(1, (err, remainingRequests) => {
        console.log(remainingRequests, err);
        // Fetch votes of the post
        getVotes(id, null, url);
      });
    });
  });
}

function getVotes (id, older, post) {
  productHunt.votes.index({ post_id: id, params: { older } }, (err, response) => {
    if (err) {
      console.error(`Unable to fetch post votes (${id})`, err);
      return;
    }
    const votes = JSON.parse(response.body).votes;
    if (votes && votes.length) {
      console.log('vote', votes[votes.length - 1].id);
      getVotes(id, votes[votes.length - 1].id, post);
      // Fetch 50 users and save into database
      votes.forEach((vote) => {
         getUser(vote.user.id, post)
       });
    }
  });
}

function getUser (id, post) {
  console.log('user', id);
  let userModel;
  switch (post) {
    case postsUrls[0]:
      userModel = UserClearbitConnect;
      break;
    case postsUrls[1]:
      userModel = UserEmailHunter;
      break;
    case postsUrls[2]:
      userModel = UserElucify3;
      break;
    case postsUrls[3]:
      userModel = UserThrust;
      break;
    case postsUrls[4]:
      userModel = UserSlikProspector;
      break;
    case postsUrls[5]:
      userModel = UserTemplatesForGmail;
      break;
    case postsUrls[6]:
      userModel = UserEmailMatcher;
      break;
    case postsUrls[7]:
      userModel = UserViolaNorbert;
      break;
  }
  userModel.findOne({ id }, (err, user) => {
    console.log(err, !!user);
    if (!user) {
      productHunt.users.show({ id }, (err, response) => {
        if (err) {
          console.error(`Unable to fetch user (${id}): `, err);
          return;
        }
        const requestedUser = JSON.parse(response.body).user;
        const userForModel = {
          FullName: requestedUser.name,
          ProductHuntProfileUrl: requestedUser.profile_url,
          TwitterUrl: ` https://twitter.com/${requestedUser.twitter_username}`,
          BioDesc: requestedUser.headline,
          Followers: requestedUser.followers_count,
          URL: requestedUser.website_url,
          id: requestedUser.id
        };
        const newUser = userModel(userForModel);
        userModel.create(newUser, (err, user) => {
          if (err) {
            console.error('Unable to create new user', err);
          }
        });
      });
    }
  });
}

getPosts();
