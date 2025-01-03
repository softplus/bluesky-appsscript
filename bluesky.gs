/**
 * @fileoverview Library for accessing (some of) Bluesky API
 * @author John Mueller (softplus@gmail.com)
 * @license MIT
 * 
 * Public functions under Bluesky:
 * login(username, password) - Authenticate with Bluesky using credentials
 * post(post_data) - Create a new post (skeet) with specified content
 * getOwnPosts(cursor) - Retrieve authenticated user's posts with optional pagination
 * delete(record_key) - Delete a specific post by its record key
 * pd_CreateOrUse(post_data) - Create new post data object or clone existing one
 * pd_AddText(post_data, text) - Append text to a post's content
 * pd_AddFacet(post_data, facetType, displayText, feature) - Add any facet to a post object
 * pd_AddHashtag(post_data, hashtag) - Add clickable hashtag with proper formatting to a post object
 * pd_AddLink(post_data, url, anchor) - Add clickable link with optional anchor text to a post object
 * pd_SetReply(post_data, root_post, previous_post) - Configure post as a thread reply
 * uploadImageBlob(image_bytes, mime_type) - Upload image blob for post embedding
 * uploadImageUrl(image_url, mime_type) - Upload image from URL for post embedding
 * pd_AddImage(post_data, image_data, alt_text) - Add uploaded image to post
 * 
 * Source: https://github.com/softplus/bluesky-appsscript/blob/main/bluesky.gs
 * (c) John Mueller
 * 
 * To use the _try_ functions at the end, supply TEST_BSKY_USERNAME & TEST_BSKY_APPWORD in Script settings.
 */

// You can't use this class outside of the library directly because of Apps Script limitations.
class _Bluesky_ {
  // called "_Bluesky" because classes can't be shared outside of libraries.
  // Used a 'var' to define Bluesky after this class. 

  // class constructor - nothing special.
  constructor() { 
    this._username = false;
    this._auth = false;
  }

  /**
  * Serializes an object into URL-encoded key-value pairs.
  * @param {Object} obj - Object to serialize 
  * @returns {string} URL-encoded string of key-value pairs joined by &
  * @private
  */
  _serialize_(obj) {
    return Object.entries(obj)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
  * Makes an authenticated HTTP request to the Bluesky API endpoint.
  * @param {string} endpoint_url - The API endpoint URL
  * @param {Object} call_options - Request configuration options
  * @param {string} [call_options.method='post'] - HTTP method (get/post)
  * @param {Object|boolean} [call_options.data=false] - Request payload data
  * @param {string} [call_options.mime_type='application/json'] - Content-Type header
  * @param {boolean} [call_options.auth=false] - Whether auth is required
  * @param {number} [call_options.retries=5] - Number of retry attempts
  * @returns {Object|boolean} JSON response if successful, false otherwise
  */
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
      ? `${endpoint_url}?${this._serialize_(options.data)}`
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

  /**
  * Authenticates with the Bluesky API using provided or stored credentials.
  * @param {string} [username] - Optional username override
  * @param {string} [password] - Password for authentication
  * @returns {boolean} True if login successful, false otherwise
  */
  login(username=false, password=false) {
    if (username) this._username=username;
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.server.createSession';
    const login_data = { 'identifier': this._username, 'password': password };
    const res = this.bskyRequest_(endpoint_url, {data:login_data});
    this._auth = res; // use res.accessJwt for authentication, res.did for posting
    return (res && true || false);
  }

  /**
  * Posts a "skeet" (post) to Bluesky. Requires login.
  * @param {Object} post_data - Content and metadata for the post
  * @returns {Object|boolean} API response if successful, false otherwise
  * @see https://docs.bsky.app/docs/api/com-atproto-repo-create-record
  */
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

  /**
  * Retrieves the authenticated user's posts from Bluesky.
  * @param {string} [cursor] - Pagination cursor for fetching subsequent pages
  * @returns {Object|boolean} API response if successful, false otherwise
  * @see https://docs.bsky.app/docs/api/com-atproto-repo-list-records
  */
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

  /**
  * Deletes a post from the authenticated user's Bluesky feed.
  * @param {string} record_key - Unique identifier (rkey) of post to delete
  * @returns {Object|boolean} API response if successful, false otherwise
  * @see https://docs.bsky.app/docs/api/com-atproto-repo-delete-record
  */
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

  /**
  * Creates a new post data object or reuses an existing one.
  * @param {Object} [post_data] - Existing post data to clone
  * @returns {Object} New post data object with default or cloned values
  */
  pd_CreateOrUse(post_data=false) {
    if (post_data) {
      return JSON.parse(JSON.stringify(post_data)); // structuredClone() doesn't exist in Apps Script yet
    } else {
      return {'createdAt': new Date().toISOString(), 'text': '', 'langs': ['en-US']}
    }
  }

  /**
  * Appends text to a post's content.
  * @param {Object} [post_data] - Existing post data to modify
  * @param {string} text - Text to append
  * @returns {Object} Updated post data object
  */
  pd_AddText(post_data=false, text) {
    let post = this.pd_CreateOrUse(post_data);
    post.text += text;
    return post;
  }

  /**
  * Calculates the byte length of a string.
  * @param {string} str - Input string to measure
  * @returns {number} Length of string in bytes
  * @private
  */
  _getByteCount_(str) {
    return Utilities.newBlob(str).getBytes().length; //  unescape(encodeURIComponent(str)).length;
  }

  /**
  * Shortens a URL for display by removing protocol, www, and truncating if needed.
  * @param {string} url - URL to shorten
  * @param {number} [max_length=20] - Maximum length before truncation
  * @returns {string} Shortened URL
  * @private
  */
  _shorterUrl_(url, max_length = 20) {
    let cleanUrl = url.replace(/^[^:]+:\/\//, '').replace(/^www\./, '').split('?')[0];
    if (cleanUrl.length>max_length) cleanUrl = cleanUrl.substring(0, max_length-3) + "...";
    return cleanUrl;
  }

  /**
  * Adds a facet (hashtag, link, etc) to a Bluesky post with proper byte indexing
  * @param {Object} post_data - Post object or post text
  * @param {string} facetType - Type of facet (tag, link, etc)
  * @param {string} displayText - Text to display in post
  * @param {Object} feature - Additional facet properties
  * @returns {Object} Updated post object
  */
  pd_AddFacet(post_data, facetType, displayText, feature) {
    let post = this.pd_CreateOrUse(post_data);
    if (!post.facets) post.facets = [];
    post.text += ' ';
    post.facets.push({
      index: {
        byteStart: this._getByteCount_(post.text),
        byteEnd: this._getByteCount_(post.text) + this._getByteCount_(displayText)
      },
      features: [{
        $type: `app.bsky.richtext.facet#${facetType}`,
        ...feature
      }]
    });
    post.text += displayText;
    return post;
  }

  /**
  * Adds a clickable hashtag to a post with proper facet formatting.
  * @param {Object} post_data - Post data to modify 
  * @param {string} hashtag - Tag text (without #)
  * @returns {Object} Updated post data with hashtag and facet
  */
  pd_AddHashtag(post_data, hashtag) {
    return this.pd_AddFacet(post_data, 'tag', '#' + hashtag, { tag: hashtag });
  }

  /**
  * Adds a clickable link to a post with optional custom anchor text.
  * @param {Object} post_data - Post data to modify
  * @param {string} url - URL to link to
  * @param {string} [anchor] - Optional custom anchor text (defaults to shortened URL)
  * @returns {Object} Updated post data with link and facet
  */
  pd_AddLink(post_data, url, anchor=false) {
    const displayText = anchor || this._shorterUrl_(url);
    return this.pd_AddFacet(post_data, 'link', displayText, { uri: url });
  }

  /**
  * Configures a post as a reply in a thread.
  * @param {Object} post_data - Post data to modify
  * @param {Object} root_post - Original post in thread
  * @param {Object} previous_post - Immediate parent post
  * @returns {Object} Updated post data with reply references
  */
  pd_SetReply(post_data, root_post, previous_post) {
    let post = this.pd_CreateOrUse(post_data);
    post.reply = {
          'root': { 'uri': root_post.uri, 'cid': root_post.cid},
          'parent': { 'uri': previous_post.uri, 'cid': previous_post.cid} };
    return post;
  } 

  /**
  * Uploads an image blob to Bluesky for embedding in posts.
  * @param {Blob} image_bytes - Image data to upload
  * @param {string} [mime_type='image/png'] - MIME type of image
  * @returns {Object} Upload response with blob reference
  * @see https://docs.bsky.app/docs/advanced-guides/posts#images-embeds
  */
  uploadImageBlob(image_bytes, mime_type='image/png') {
    if (!this._auth) { console.log("ERROR: No auth found."); return; }
    const endpoint_url = 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob';
    // https://docs.bsky.app/docs/advanced-guides/posts#images-embeds
    // https://docs.bsky.app/docs/api/com-atproto-repo-upload-blob
    return this.bskyRequest_(endpoint_url, {data:image_bytes, auth:true, 'mime_type':mime_type});
  }

  /**
  * Uploads an image to Bluesky from a URL.
  * @param {string} image_url - URL of image to upload
  * @param {string} [mime_type='image/png'] - MIME type of image
  * @returns {Object|boolean} Upload response if successful, false otherwise
  */
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

  /**
  * Adds an uploaded image to a post.
  * @param {Object} post_data - Post data to modify
  * @param {Object} image_data - Image metadata from upload
  * @param {string} [alt_text=''] - Image description for accessibility
  * @returns {Object} Updated post data with embedded image
  */
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
function _try_bsky_image1() {
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
function _try_bsky_image2() {
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
function _try_bsky_login() {
  const bsky1 = Bluesky;
  if (!bsky1.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("FAIL 1"); return;} else { console.log("PASS 1");}
  const bsky2 = Bluesky;
  if (!bsky2.login(TEST_BSKY_USER_, TEST_BSKY_PWD_ + "x")) {console.log("PASS 2"); } else { console.log("FAIL 2")}
}

// a simple text skeet
function _try_bsky_post2() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'This is a post');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet + hashtag
function _try_bsky_post3() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'This is a post');
  post = bsky.pd_AddHashtag(post, 'cheeses');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet, hashtag, then more text
function _try_bsky_post4() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let post = bsky.pd_AddText(false, 'Hello 世界');
  post = bsky.pd_AddHashtag(post, 'cheeses');
  post = bsky.pd_AddText(post, ' more text');
  console.log(post);
  console.log(bsky.post(post));
}

// a text skeet with a bunch of links
function _try_bsky_post5() {
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
function _try_bsky_getOwnPosts() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  let res = bsky.getOwnPosts();
  console.log(res);
}

// attempt to delete the last skeet
function _try_bsky_delete1() {
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
function _try_bsky_delete_all_posts() {
  const bsky = Bluesky;
  if (!bsky.login(TEST_BSKY_USER_, TEST_BSKY_PWD_)) {console.log("Can't log in"); return;}
  const {records = []} = bsky.getOwnPosts() || {};
  if (!records.length) return console.log("no posts");
  records.map(post => post.uri.split('/').pop()) // the post ID is in the URI
        .forEach((id, i) => { bsky.delete(id); console.log(`Deleted #${i + 1}`)});
}
