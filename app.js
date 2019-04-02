'use strict';

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const app = express();
const mfaaurl = 'https://www.mortgageandfinancehelp.com.au/find-accredited-broker/';
const fbaaurl = 'https://www.fbaa.com.au/wp-admin/admin-ajax.php';
const fbaa_action = 'do_search_member';

//allow CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

//define route
app.get('/', (req, res) => {
  let query=req.query.query;
  let location=req.query.location;
  let fbaa_recaptcha=req.query.fbaarecaptcha;
  let fbaa_fbaasearchsecure=req.query.fbaasecure;
  res.setHeader('Content-Type', 'application/json');
  let resobj = {
    error: null,
    MFAAadvisers: null,
    FBAAadvisers: null
  };
  //MFAA
	let url = mfaaurl + '?query='+query+'&location='+location;
  axios.get(url)
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

      //response
      res.send(resobj);
    })
    .catch( (err) => {
      console.log(err.message + ' ' + err.stack);
      res.setHeader('Content-Type', 'application/json');
      resobj.error = {message: err.message, stack: err.stack};
      res.send(resobj);
    });
});

module.exports = app;
