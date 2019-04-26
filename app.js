'use strict';

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const bodyParser = require('body-parser');
const app = express();
const mfaaurl = 'https://www.mortgageandfinancehelp.com.au/find-accredited-broker/';
const fbaaurl = 'https://www.fbaa.com.au/wp-admin/admin-ajax.php';
const fbaa_action = 'do_search_member';
const concurrency = 10;
const maxnumberperfun = 100;

//allow CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});
//body parser for post requests
app.use(bodyParser.json());

//define route
//verify
app.post('/verify', (req, res) => {
  let fbaarecaptcha=req.body.fbaarecaptcha;
  let fbaasecure=req.body.fbaasecure;
  let advisers=req.body.advisers;
  if (advisers.length > maxnumberperfun){
    let resobj = {
      error: {message: "max number of input advisers is "+maxnumberperfun, stack: "n/a"},
      results: null
    };
    res.send(resobj);
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  let finalresults = [];
  loopadvisers(res, fbaarecaptcha, fbaasecure, advisers, finalresults);
});

//var count = 0;
let loopadvisers = (res, fbaarecaptcha, fbaasecure, advisers, finalresults) => {
  //count ++;
  //console.log('|| ' + count + ' ' + JSON.stringify(finalresults.length > concurrency ? finalresults.splice(finalresults.length-concurrency) : finalresults) + ' ||');
  if (advisers == null) {
    let resobj = {
      error: null,
      results: finalresults
    };
    res.send(resobj);
    return;
  }
  let curradvisers,nextadvisers;
  if (advisers.length > concurrency) {
    curradvisers = advisers.slice(0, concurrency);
    nextadvisers = advisers.slice(concurrency);
  }
  else {
    curradvisers = advisers;
    nextadvisers = null;
  }

  let promises_results = [];
  curradvisers.forEach( (adviser) => {
    let query = adviser.FirstName + ' ' + adviser.LastName;
    let location = '';
    promises_results.push(
      search_mfaa_fbaa(query, location, fbaarecaptcha, fbaasecure)
        .then( (resdata) => {
          let result = {
            FamilyID: adviser.FamilyID,
            MFAA: (resdata.MFAAadvisers.length > 0 ? 1 : 0),//(resdata.MFAAadvisers.length > 0 ? 'YES - '+JSON.stringify(resdata.MFAAadvisers) : 'NO'),
            FBAA: (resdata.FBAAadvisers.length > 0 ? 1 : 0) //(resdata.FBAAadvisers.length > 0 ? 'YES - '+JSON.stringify(resdata.FBAAadvisers) : 'NO')
          }
          return result;
        })
    );
  });
  //promise.all to generate results
  Promise.all(promises_results)
    .then( (results) => {
      finalresults = finalresults.concat(results);
      loopadvisers(res, fbaarecaptcha, fbaasecure, nextadvisers, finalresults);
    })
    .catch( (err) => {
      console.log(err.message + ' ' + err.stack);
      let resobj = {
        error: {message: err.message, stack: err.stack},
        results: null
      };
      res.send(resobj);
      return;
    });
};

//search
app.get('/', (req, res) => {
  let query=req.query.query;
  let location=req.query.location;
  let fbaarecaptcha=req.query.fbaarecaptcha;
  let fbaasecure=req.query.fbaasecure;
  res.setHeader('Content-Type', 'application/json');
  let resobj = {
    error: null,
    MFAAadvisers: null,
    FBAAadvisers: null
  };
  search_mfaa_fbaa(query, location, fbaarecaptcha, fbaasecure)
    .then( (resdata) => {
      resobj = resdata;
      res.send(resobj);
    })
    .catch( (err) => {
      console.log(err.message + ' ' + err.stack);
      resobj.error = {message: err.message, stack: err.stack};
      res.send(resobj);
    });
});

let search_mfaa_fbaa = (query, location, fbaa_recaptcha, fbaa_fbaasearchsecure) => {
  let resobj = {
    error: null,
    MFAAadvisers: null,
    FBAAadvisers: null
  };
  //MFAA
  let url = mfaaurl + '?query='+query+'&location='+location;
  return axios.get(url)
    .then( (resdata) => {
      let html = resdata.data;
      let $ = cheerio.load(html);
      let advisers = $('a.viewdetails_button').map(function(i,el){
        return {
          PreferredName: $(el).attr('data-preferred_name'),
          LastName: $(el).attr('data-last_name'),
          ListingKind: $(el).attr('data-listing_kind'),
          Latitude: $(el).attr('data-latitude'),
          Phone: $(el).attr('data-phone'),
          Mobile: $(el).attr('data-mobile'),
          Email: $(el).attr('data-email'),
          Address: $(el).attr('data-address'),
          City: $(el).attr('data-city'),
          State: $(el).attr('data-state'),
          Company: $(el).attr('data-company')
        };
      }).get();
      resobj.MFAAadvisers = advisers;

      //FBAA
      url=fbaaurl;
      let postcode=(isNaN(location) ? '' : location);
      let suburb=(isNaN(location) ? location : '');
      let postdata = {
        action: fbaa_action,
        businessName:query,
        loantype:'',
        suburb:suburb,
        state:'',
        postcode:postcode,
        fbaasearchsecure:fbaa_fbaasearchsecure,
        recaptcha:fbaa_recaptcha
      };
      return axios.post(url,qs.stringify(postdata), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    })
    .then( (resdata) => {
      //unescape json data
      let fbaadata = JSON.parse(resdata.data);
      let advisers = fbaadata.map(function(adviser){
        return {
          Salutation: adviser.Application.AppContact.Salutation,
          FirstName: adviser.Application.AppContact.FirstName,
          LastName: adviser.Application.AppContact.LastName,
          Phone: adviser.Application.AppContact.Phone,
          Fax: adviser.Application.AppContact.Fax,
          Website: adviser.Application.AppAccount.Website,
          TradingName: adviser.Application.AppAccount.TradingName,
          StreetSuburb: adviser.Application.AppAccount.StreetSuburb,
          StreetStreet: adviser.Application.AppAccount.StreetStreet,
          StreetState: adviser.Application.AppAccount.StreetState,
          StreetPostCode: adviser.Application.AppAccount.StreetPostCode,
          StreetCountry: adviser.Application.AppAccount.StreetCountry,
          Status: adviser.Application.AppAccount.Status,
          Products: adviser.Application.AppAccount.Products,
          PostalSuburb: adviser.Application.AppAccount.PostalSuburb,
          PostalStreet: adviser.Application.AppAccount.PostalStreet,
          PostalState: adviser.Application.AppAccount.PostalState,
          PostalPostCode: adviser.Application.AppAccount.PostalPostCode,
          PostalCountry: adviser.Application.AppAccount.PostalCountry,
          MemberSince: adviser.Application.AppAccount.MemberSince,
          CompanyName: adviser.Application.AppAccount.CompanyName,
          ABN: adviser.Application.AppAccount.ABN
        };
      });
      resobj.FBAAadvisers = advisers;
      return resobj;
    });
};

module.exports = app;
