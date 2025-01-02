/**
 * Bluesky library
 *
 * Source: 
 * (c) John Mueller, MIT license
 * 
 * Requirements
 * - TEST_BSKY_USERNAME & TEST_BSKY_APPWORD in Script settings for test-functions
 */

class _Bluesky_ {
  // called "_Bluesky" because classes can't be shared outside of libraries.
  // Used a 'var' to define Bluesky after this class. 

  // class constructor
  constructor() { 
    this._username = false;
    this._auth = false;
  }

  // private function to map property/values in an object to GET query parameters
  serialize_(obj) {
    return Object.entries(obj)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  // send a request to the API
  bskyRequest_(endpoint_url, call_options={}) {
    // builds request for bluesky API calls
    const options = { // defaults & supported properties
      method: 'post',
      data: false,
      mime_type: 'application/json',
      auth: false,
      retries: 5,
      ...call_options
    };
    if (options.auth && !this._auth) { console.log("FAIL: Authentication missing."); return false; }
    let request_options = {
        'method': options.method.toLowerCase(),
        'headers': { 'Content-Type': options.mime_type.toLowerCase() }
    };
    const request_url = (options.method.toLowerCase() === 'get' && options.data)
      ? `${endpoint_url}?${this.serialize_(options.data)}`
      : endpoint_url;

    if (options.method.toLowerCase()=='post') {
      if (options.mime_type.toLowerCase() == 'application/json') {
        request_options.payload = JSON.stringify(options.data);
      } else {
        request_options.payload = options.data;
      }
    }
    if (options.auth) {
      request_options.headers.Authorization = `Bearer ${this._auth.accessJwt}`;
    }
    for (let attempt = 1; attempt <= options.retries; attempt++) {
      try {
        const response = UrlFetchApp.fetch(request_url, request_options);
        return JSON.parse(response.getContentText());
      } catch (error) {
        Logger.log(error.message);
        if (attempt<options.retries) {
          Logger.log(`WARN: API Request failed; will retry ${options.retries - attempt} times`);
          continue;
        }
        Logger.log(`FAIL: API Request failed too many times.`);
        return false;
      }
    }
    return false; // should never get here
  }

  // Login to Bluesky
  login(username=false, password=false) {
    if (username) this._username=username;
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.server.createSession';
    const login_data = { 'identifier': this._username, 'password': password };
    const res = this.bskyRequest_(endpoint_url, {data:login_data});
    this._auth = res; // use res.accessJwt for authentication, res.did for posting
    return (res && true || false);
  }

  // post a skeet
  post(post_data) {
    if (!this._auth) { console.log("ERROR: No auth found."); return false; }
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';
    // https://docs.bsky.app/docs/api/com-atproto-repo-create-record
    const data_payload = {
      '$type': 'app.bsky.feed.post',
      'repo': this._auth.did,
      'collection': 'app.bsky.feed.post',
      'record': post_data
    };
    return this.bskyRequest_(endpoint_url, {data:data_payload, auth:true});
  }

  getOwnPosts(cursor=false) {
    if (!this._auth) { console.log("ERROR: No auth found."); return false; }
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.repo.listRecords';
    // https://docs.bsky.app/docs/api/com-atproto-repo-list-records
    let data_payload = {
      '$type': 'app.bsky.feed.post', // is this needed? who knows
      'repo': this._auth.did, // required
      'collection': 'app.bsky.feed.post', // required
      'limit': 100, // 1-100
    };
    if (cursor) data_payload.cursor = cursor;
    return this.bskyRequest_(endpoint_url, {method:'get', data:data_payload, auth:false});
  }

  delete(record_key) {
    if (!this._auth) { console.log("ERROR: No auth found."); return false; }
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.repo.deleteRecord';
    // https://docs.bsky.app/docs/api/com-atproto-repo-delete-record
    const data_payload = {
      '$type': 'app.bsky.feed.post',
      'repo': this._auth.did, // required
      'collection': 'app.bsky.feed.post', // required
      'rkey': record_key, // required = last part of URI
    };
    return this.bskyRequest_(endpoint_url, {data:data_payload, auth:true});
  }

  // create or reuse a post_data object
  pd_CreateOrUse(post_data=false) {
    if (post_data) {
      return JSON.parse(JSON.stringify(post_data)); // structuredClone() doesn't exist in Apps Script yet
    } else {
      return {'createdAt': new Date().toISOString(), 'text': '', 'langs': ['en-US']}
    }
  }

  // append text to a post object
  pd_AddText(post_data=false, text) {
    let post = this.pd_CreateOrUse(post_data);
    post.text += text;
    return post;
  }

  _getByteCount_(str) {
    return Utilities.newBlob(str).getBytes().length; //  unescape(encodeURIComponent(str)).length;
  }

  // append a hashtag to a post object, link it
  pd_AddHashtag(post_data, hashtag) {
    // todo: deal better with byte lengths
    let post = this.pd_CreateOrUse(post_data);
    if (!post.facets) post.facets = [];
    let facets = post.facets;
    post.text += ' ';
    facets.push({
        index: {
          byteStart: this._getByteCount_(post.text),
          byteEnd: this._getByteCount_(post.text) + this._getByteCount_("#" + hashtag),
        },
        features: [{
          $type: 'app.bsky.richtext.facet#tag',
          tag: hashtag
        }]
    });
    post.text += "#" + hashtag;
    return post;
  }

  // shorten URLs for visible display
  _shorterUrl_(url, max_length = 20) {
    let cleanUrl = url.replace(/^[^:]+:\/\//, '').replace(/^www\./, '').split('?')[0];
    if (cleanUrl.length>max_length) cleanUrl = cleanUrl.substring(0, max_length-3) + "...";
    return cleanUrl;
  }

  // append a link to a post object, link to it, shorten URL as anchor if none
  pd_AddLink(post_data, url, anchor=false) {
    // todo: deal better with byte lengths
    let post = this.pd_CreateOrUse(post_data);
    if (!post.facets) post.facets = [];
    let facets = post.facets;
    const use_anchor = anchor || this._shorterUrl_(url);
    post.text += ' ';
    facets.push({
        index: {
          byteStart: this._getByteCount_(post.text),
          byteEnd: this._getByteCount_(post.text) + this._getByteCount_(use_anchor),
        },
        features: [{
          $type: 'app.bsky.richtext.facet#link',
          uri: url
        }]
    });
    post.text += use_anchor;
    return post;
  }

  // set a root & previous post to enable a reply chain
  pd_SetReply(post_data, root_post, previous_post) {
    let post = this.pd_CreateOrUse(post_data);
    post.reply = {
          'root': { 'uri': root_post.uri, 'cid': root_post.cid},
          'parent': { 'uri': previous_post.uri, 'cid': previous_post.cid} };
    return post;
  } 

  // upload an image blob for use as an embed
  uploadImageBlob(image_bytes, mime_type='image/png') {
    if (!this._auth) { console.log("ERROR: No auth found."); return; }
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob';
    // https://docs.bsky.app/docs/advanced-guides/posts#images-embeds
    // https://docs.bsky.app/docs/api/com-atproto-repo-upload-blob
    return this.bskyRequest_(endpoint_url, {data:image_bytes, auth:true, 'mime_type':mime_type});
  }

  // upload an image for use as an embed, from a given URL
  uploadImageUrl(image_url, mime_type='image/png') {
    try {
      const response = UrlFetchApp.fetch(image_url, {muteHttpExceptions: true});
      if (response.getResponseCode() == 200) {
        return this.uploadImageBlob(response.getBlob(), mime_type);
      }
      return false;
    } catch(f) {
      Logger.log("ERROR: Bluesky.uploadImageUrl() failed");
      Logger.log(f.message);
      return false;
    }
  }

  // append an image to a post, given its metadata
  pd_AddImage(post_data, image_data, alt_text='') {
    // must be uploaded first
    let post = this.pd_CreateOrUse(post_data);
    if (!post.embed) post.embed = {'$type': "app.bsky.embed.images", 'images': []}
    post.embed.images.push({'alt': alt_text, 'image': image_data.blob});
    return post;
  }

  // end of library
}

// implement for sharing
var Bluesky = new _Bluesky_();

/**
 * Just some test & example functions below
 */

// Place username & app-password into script settings
const _getScriptSecret_ = key => PropertiesService.getScriptProperties().getProperty(key) || false;
const TEST_BSKY_USER_ = _getScriptSecret_("TEST_BSKY_USERNAME");
const TEST_BSKY_PWD_  = _getScriptSecret_("TEST_BSKY_APPWORD");

// post a skeet with embedded image from URL manually
function _test_bsky_image1() {
  const img_url = 'https://johnmu.com/2023-midjourney-to-lightoom/lr-api-1_hu12157680768901824724.png';
  let response = UrlFetchApp.fetch(img_url, {muteHttpExceptions: true});
  if (response.getResponseCode() == 200) {
    const img_blob = response.getBlob();
    const bsky = Bluesky;
    if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't login"); return;}
    const img_data = bsky.uploadImageBlob(img_blob, 'image/png');
    console.log(img_data);
    let post = bsky.pd_AddText(false, 'Test');
    post = bsky.pd_AddImage(post, img_data, 'alt-text');
    const res = bsky.post(post);
    console.log(res);
  }
}

// post a skeet with an embedded image from URL with library
function _test_bsky_image2() {
  const img_url = 'https://johnmu.com/2023-midjourney-to-lightoom/lr-api-1_hu12157680768901824724.png';
    const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't login"); return;}
  const img_data = bsky.uploadImageUrl(img_url, 'image/png');
  console.log(img_data);
  let post = bsky.pd_AddText(false, 'Test');
  post = bsky.pd_AddImage(post, img_data, 'alt-text');
  const res = bsky.post(post);
  console.log(res);
}

// test login function; 1x with correct username/password, 1x with wrong username/password
function _test_bsky_login() {
  const bsky1 = Bluesky;
  if (!bsky1.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("FAIL 1"); return;} else { console.log("PASS 1");}
  const bsky2 = Bluesky;
  if (!bsky2.login(TEST_BSKY_USER_, TEST_BSKY_PWD_ + "x")) {console.log("PASS 2"); } else { console.log("FAIL 2")}
}

// a simple text skeet
function _test_bsky_post2() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'This is a post');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet + hashtag
function _test_bsky_post3() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'This is a post');
  post = bsky.pd_AddHashtag(post, 'cheeses');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet, hashtag, then more text
function _test_bsky_post4() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'Hello 世界');
  post = bsky.pd_AddHashtag(post, 'cheeses');
  post = bsky.pd_AddText(post, ' more text');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet with a bunch of links
function _test_bsky_post5() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'This is a post');
  post = bsky.pd_AddLink(post, 'https://www.example.com/cheese/colored?parameters');
  post = bsky.pd_AddLink(post, 'https://example.com/', 'other.com');
  post = bsky.pd_AddLink(post, 'https://example.com/?2', 'link');
  console.log(post);
  console.log(bsky.post(post));
}

// fetch your own skeets
function _test_bsky_getOwnPosts() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let res = bsky.getOwnPosts();
  console.log(res);
}

// attempt to delete the last skeet
function _test_bsky_delete1() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let res = bsky.getOwnPosts();
  if (res.records.length) {
    console.log(res);
    let res2 = bsky.delete(res.records[0].uri.split('/').pop() );
    console.log(res2);
  } else { console.log("no posts"); }
}

// delete all skeets in this account: only do this in your test account! lol, bye
function _test_bsky_delete_all_posts() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  const {records = []} = bsky.getOwnPosts() || {};
  if (!records.length) return console.log("no posts");
  records.map(post => post.uri.split('/').pop()) // the post ID is in the URI
        .forEach((id, i) => { bsky.delete(id); console.log(`Deleted #${i + 1}`)});
}
