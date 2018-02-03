const mongoose = require('mongoose');
const productHuntAPI = require('producthunt');
const rateLimiter = require('limiter').RateLimiter;
const yaml = require('js-yaml');
const fs = require('fs');
const async = require('async');
const mongooseToCsv = require('mongoose-to-csv');
const csv = require('csv-parser');

mongoose.connect('mongodb://localhost/companyUsers', { useMongoClient: true });

const Schema = mongoose.Schema;

const userSchema = new Schema({
  FullName: String,
  ProductHuntProfileUrl: String,
  TwitterUrl: String,
  BioDesc: String,
  Followers: Number,
  Url: String,
  id: Number,
  sourceCompanies: String
});

userSchema.plugin(mongooseToCsv, {
  headers: 'FullName ProductHuntProfileUrl TwitterUrl BioDesc Followers Url, SourceCompanies',
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
    },
    'SourceCompanies': function (doc) {
      return `"${doc.SourceCompanies}"`;
    }
  }
});

const userModel = mongoose.model('CompanyUser', userSchema);

const companySchema = new Schema({
  company_id: String,
  company_name: String,
  is_loaded: Boolean
});

const companyModel = mongoose.model('Company', companySchema);


const algoliaLimiter = new rateLimiter(100, 'second');
const productHuntLimiter = new rateLimiter(50, 'minute');


function getCompanies () {
  fs.createReadStream('AppendPHfromSaaS.csv')
    .pipe(csv(['company_id', 'company_name']))
    .on('data', (data) => {
      companyModel.findOne({ company_id: data['company_id'] }, (err, company) => {
        if (err) {
          console.error('Unable to get company', err);
        }
        if (!company) {
          if (data['company_id'] === 'company_id') {
            return;
          }
          data['is_loaded'] = false;
          companyModel.create(companyModel(data), (err, company) => {
            if (err) {
              console.error('Unable to create new company', err);
            }
          });
        }
      });
    })
    .on('end', () => console.log('end'));
}

getCompanies();