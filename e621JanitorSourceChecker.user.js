// ==UserScript==
// @name         e621 Janitor Source Checker
// @version      0.46
// @description  Tells you if a pending post matches its source.
// @author       Tarrgon
// @match        https://e621.net/posts*
// @match        https://e621.net/post_replacements/*
// @match        https://e926.net/posts*
// @match        https://e926.net/post_replacements/*
// @updateURL    https://github.com/mm12/e621-JSV/raw/refs/heads/mods/e621JanitorSourceChecker.user.js
// @downloadURL  https://github.com/mm12/e621-JSV/raw/refs/heads/mods/e621JanitorSourceChecker.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=e621.net
// @connect      api.fluffle.xyz
// @connect      search.yiff.today
// @connect      static1.e621.net
// @connect      kemono.cr
// @connect      public.api.bsky.app
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @run-at       document-end
// ==/UserScript==

const RELOAD_AFTER_UPDATE = true;

let RETRY_COUNT = 0;

document.head.append(Object.assign(document.createElement("style"), {
  type: "text/css",
  textContent: `
.loading:after {
  overflow: hidden;
  display: inline-block;
  vertical-align: bottom;
  -webkit-animation: ellipsis steps(4, end) 900ms infinite;
  animation: ellipsis steps(4, end) 900ms infinite;
  content: "\\2026";
  width: 0px;
}

@keyframes ellipsis {
  to {
    width: 16px;
  }
}

@-webkit-keyframes ellipsis {
  to {
    width: 16px;
  }
}`
}));

let sourcesToAdd = [];
let timeout;

const getCsrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function waitForSelector(selector, timeout = 5000) {
  return new Promise(async (resolve) => {
    let waited = 0
    while (true) {
      let ele = document.querySelector(selector)
      if (ele) return resolve(ele)
      await wait(100)
      waited += 100
      if (waited >= timeout) return resolve(null)
    }
  })
}

function getImageBlob(fileUrl) {
  return new Promise((resolve, reject) => {
    try {
      const container = document.getElementById('image-container');
      const image = new Image()

      const width = Number(container.getAttribute('data-width'));
      const height = Number(container.getAttribute('data-height'));
      const ratio = width < height ? 256 / width : 256 / height;
      const calculatedWidth = Math.floor(width * ratio);
      const calculatedHeight = Math.floor(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = calculatedWidth;
      canvas.height = calculatedHeight;


      image.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, calculatedWidth, calculatedHeight);
        canvas.toBlob(resolve, 'image/png');
      };

      image.crossOrigin = '';
      image.src = fileUrl;
    } catch (e) {
      reject(e);
    }
  });
}

function getFluffleData(blob) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('limit', '32');
    formData.append('file', blob, 'image.png');

    GM.xmlHttpRequest({
      method: 'POST',
      url: `https://api.fluffle.xyz/exact-search-by-file`,
      headers: {
        'User-Agent': "Fluffle621/main (by 'tarrgon.' on Discord)",
        'Accept': 'application/json'
      },
      onload: function (response) {
        try {
          resolve(JSON.parse(response.responseText));
        } catch (e) {
          reject(e);
        }
      },
      onerror: function (e) {
        reject(e);
      },
      data: formData,
      fetch: true
    })
  })
}

const messages = [
  'None',
  'Empty',
  'Devoid',
  'Blank',
  'Dry'
];

const faces = [
  ':(',
  'D:',
  '˙◠˙',
  '૮(˶ㅠ︿ㅠ)ა',
  '(╥‸╥)',
  '(˚ ˃̣̣̥⌓˂̣̣̥ )',
  '(ó﹏ò｡)',
  '(ᗒᗣᗕ)՞'
];

function getRandomEmptyResultMessage() {
  return `${messages[Math.floor(Math.random() * messages.length)]} ${faces[Math.floor(Math.random() * faces.length)]}`
}

async function updatePostInVerifier() {
  const container = document.getElementById('image-container');
  const id = container.getAttribute('data-id');

  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url: `https://search.yiff.today/checksource/${id}?checkapproved=true&forceupdate=true`,
      onload: function () {
        resolve();
      },
      onerror: function (e) {
        reject(e);
      }
    });
  });
}

async function sendSources() {
  timeout = null;

  try {
    const container = document.getElementById('image-container');
    const id = container.getAttribute('data-id');

    const res = await fetch(`https://e621.net/posts/${id}.json`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        post: {
          source_diff: sourcesToAdd.join('\n'),
          edit_reason: 'FluffleSource'
        }
      })
    });

    sourcesToAdd = [];

    if (res.ok) {
      Danbooru.notice('Successfully added sources.');

      await updatePostInVerifier();
      if (RELOAD_AFTER_UPDATE) {
        await wait(50);
        window.location.reload();
      }
    } else {
      console.error(await res.text());
      Danbooru.error('Error setting source. Check console.');
    }
  } catch (e) {
    console.error(e);
    Danbooru.error('Error setting source. Check console.');
  }
}

function addSource(result, immediate, event) {
  event.stopImmediatePropagation();
  event.preventDefault();

  if (sourcesToAdd.includes(result.url)) return;

  sourcesToAdd.push(result.url);
  if (immediate) {
    sendSources();
    return;
  }

  if (!timeout) {
    timeout = setTimeout(sendSources, 500);
  } else {
    clearTimeout(timeout);
    timeout = setTimeout(sendSources, 500);
  }
}

(async function () {
  'use strict';

  if (window.location.href.startsWith("https://e621.net/post_replacements/")) {
    let params = new URLSearchParams(window.location.search)

    let urlField = document.getElementById("replacement-uploader").querySelector("input[type='text']")
    let noSourceBox = document.getElementById("no_source")
    let sourceInput = document.querySelector(".upload-source-row > input")
    let reasonField = document.querySelector("[list='reason-datalist']")

    if (params.has("url")) urlField.value = params.get("url")
    if (params.has("reason")) reasonField.value = params.get("reason")

    if (params.has("source")) {
      sourceInput.value = params.get("source")
    } else if (params.has("url")) {
      noSourceBox.checked = true
    }

    setTimeout(() => {
      urlField.dispatchEvent(new Event("input"))
      noSourceBox.dispatchEvent(new Event("change"))
      reasonField.dispatchEvent(new Event("input"))
      sourceInput.dispatchEvent(new Event("input"))
    }, 100)

    return
  }

  const colors = {
    "lime": ["lime", "#D833B0"],
    "yellow": ["yellow", "#FEFE62"],
    "red": ["red", "#FFA745"]
  }

  if (!(await GM.getValue("colorBlindMode"))) {
    await GM.setValue("colorBlindMode", "false")
  }

  let colorIndex = await GM.getValue("colorBlindMode", "false") == "false" ? 0 : 1

  const addSourceSign = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-plus")
    i.style.color = colors["lime"][colorIndex]
    i.title = "Add source"
    i.style.marginRight = "0.25rem"
    i.style.marginLeft = "0.25rem"
    return i
  })();

  const md5Match = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check-double", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.title = "MD5 match"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const dimensionAndFileTypeMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.title = "Dimension and file type match"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const dimensionMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "Dimension match"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const aspectRatioMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-square", "jsv-icon")
    i.title = "Approx. aspect ratio match"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const fileTypeMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-xmark", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "File type match"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const noMatches = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-xmark", "jsv-icon")
    i.style.color = colors["red"][colorIndex]
    i.title = "No matches"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const spinner = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-spinner", "fa-spin", "jsv-icon")
    i.style.color = "yellow"
    i.title = "Queued"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const unknown = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-question", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "Unknown"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const bvas = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-plus", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.style.marginRight = "0.25rem"
    i.style.marginLeft = "0.25rem"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const phashMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-exclamation", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.title = "Perceptually identical"
    i.style.marginRight = "0.25rem"
    i.style.marginLeft = "0.25rem"
    i.style.width = "10px"
    i.style.display = "inline-block"
    i.style.textAlign = "center"
    // i.style.outline = "1px solid"
    // i.style.outlineColor = "lime"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const info = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-circle-info", "jsv-icon")
    i.style.color = "cyan"
    i.style.marginRight = "0.25rem"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const force = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-angles-down", "jsv-icon")
    i.style.color = "green"
    i.style.cursor = "pointer"
    i.title = "Get source data"
    if (window.location.pathname == "/posts") {
      i.style.lineHeight = "inherit"
      i.style.verticalAlign = "middle"
    }
    return i
  })();

  const reload = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-rotate")
    i.style.color = "green"
    i.style.cursor = "pointer"
    i.title = "Update source data"
    return i
  })();

  const kemonoIcon = (() => {
    let img = document.createElement("img")
    img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAACTUExURQAAAAQCAAMBABQKBGUxFBUKBAAAAAEAAEgjD2MwFCsVCKJPIYdBG1YqESAPBjocDJpLH4ZBG389GUskD2cyFW41FkAfDRkMBaJOIb9cJ0IgDQMBABAHAy4WCQgEApVJHno7GQAAAKpSIrRYJMZgKNJmK+RvLl4uE5tLHxIJAyQRB4pDHOdwLwEAAOpyMN9sLf////15I3UAAAAidFJOUwBGF4GvKQlUV8s35eBtmtvzt/u5jPf+/f30SGCuzW/GoMxWg8riAAAAAWJLR0Qwrtwt5AAAAAd0SU1FB+gHERUzDxJ/xp8AAAC+SURBVBjTTY9tE4IgEIQPjMNMJS0yU8sISwXx//+7sJcZ99PNzu3Os0AorEQIBBsGgIxzhgDhNoJoFyeIqRApxWSfIWCm8g0/PHQcHnN19LFES3kq8u6pz6/y4uPBvtedHEajHy9ZIZC6f1pr1TgVw1DUBCqhnTecmaZRKVEBafrZG1afRuNUw4FeG9ktztzNZxF4KEqq29JiXZly9gUOy89LRvG3ANulZoH4i+2cm1tcrUyMiaP1bFrfg+/1Bu2eEsMGhTxDAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI0LTA3LTE3VDIxOjUxOjE1KzAwOjAwXKO44gAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNC0wNy0xN1QyMTo1MToxNSswMDowMC3+AF4AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjQtMDctMTdUMjE6NTE6MTUrMDA6MDB66yGBAAAAAElFTkSuQmCC"
    img.title = "Found kemono match"
    return img
  })();

  function createSource(result, immediate) {
    const div = document.createElement('div')
    div.classList.add('source-link', 'fluffle621-source-link');

    const wrappedAnchor = document.createElement('a');

    wrappedAnchor.onclick = addSource.bind(null, result, immediate);

    wrappedAnchor.title = 'Add source';
    wrappedAnchor.appendChild(addSourceSign.cloneNode(true));
    div.appendChild(wrappedAnchor);

    const a = document.createElement('a');
    a.classList.add('decorated', 'fluffle621-source');
    a.target = '_blank';
    a.rel = 'nofollow noreferrer noopener';
    a.href = result.url;
    a.innerText = result.url;

    div.appendChild(a);

    return div;
  }

  function addResults(results) {
    const existingList = document.querySelector('.post-sidebar-info');

    document.getElementById('fluffle-results')?.remove();

    const list = document.createElement('ul');
    list.id = 'fluffle-results'
    list.setAttribute('data-loaded', 'true');
    list.classList.add('post-sidebar-info');

    const listItem = document.createElement('li');
    listItem.classList.add('source-links');
    listItem.append('Fluffle Sources:');

    if (results.length == 0) {
      listItem.appendChild(document.createElement('br'));
      listItem.append(getRandomEmptyResultMessage());
    } else {
      for (const result of results) {
        listItem.append(createSource(result, results.length == 1));
      }
    }

    list.appendChild(listItem);

    existingList.after(list);
  }

  function createTemporaryList() {
    const existingList = document.querySelector('.post-sidebar-info');

    const list = document.createElement('ul');
    list.id = 'fluffle-results'
    list.setAttribute('data-loaded', 'false');
    list.classList.add('post-sidebar-info');

    const listItem = document.createElement('li');
    listItem.classList.add('source-links');
    listItem.append('Fluffle Sources:');

    listItem.appendChild(document.createElement('br'));

    const loading = document.createElement('div');
    loading.innerText = 'Loading'
    loading.classList.add('loading')
    listItem.appendChild(loading);

    list.appendChild(listItem);

    existingList.after(list);
  }

  async function checkFluffle() {
    const container = document.getElementById('image-container');
    const fileType = container.getAttribute('data-file-ext');

    if (fileType == 'webm' || fileType == 'mp4') return;

    createTemporaryList();

    const fileUrl = container.getAttribute('data-file-url');
    const imageBlob = await getImageBlob(fileUrl);

    const fluffleData = await getFluffleData(imageBlob);
    const fluffleResults = fluffleData.results.filter(r => r.match == 'exact' && r.platform != 'e621');

    addResults(fluffleResults);

    const links = fluffleResults.map(a => a.url);

    if (await anyLinksSupported(links)) {
      const data = await checkFluffleLinks(id, links);
      await processData(data, false, "#fluffle-results .source-links");
    }
  }

  async function getImageSHA256(url) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "GET",
        responseType: "arraybuffer",
        url,
        onload: async function (response) {
          try {
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", response.response)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            resolve(hashArray.map(b => b.toString(16).padStart(2, "0")).join(""))
          } catch (e) {
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }
      GM.xmlHttpRequest(req)
    })
  }

  async function getKemonoData(hash) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "GET",
        url: `https://kemono.cr/api/v1/search_hash/${hash}`,
        headers: {
          Accept: "text/css"
        },
        onload: async function (response) {
          try {
            resolve(JSON.parse(response.responseText))
          } catch (e) {
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }

      GM.xmlHttpRequest(req)
    })
  }

  async function getPostKemonoData() {
    return await getKemonoData(await getImageSHA256(document.getElementById("image-container").getAttribute("data-file-url")))
  }

  async function getData(id, force = false, updatePost = false) {
    if (!force) {
      return new Promise((resolve, reject) => {
        let req = {
          method: "GET",
          url: `https://search.yiff.today/checksource/${id}?forceupdate=${updatePost}`,
          onload: function (response) {
            try {
              let data = JSON.parse(response.responseText)

              resolve(data)
            } catch (e) {
              reject(e)
            }
          },
          onerror: function (e) {
            reject(e)
          }
        }

        GM.xmlHttpRequest(req)
      })
    } else {
      return new Promise((resolve, reject) => {
        let req = {
          method: "GET",
          url: `https://search.yiff.today/checksource/${id}?checkapproved=true&waitfordata=true&forceupdate=${updatePost}`,
          onload: function (response) {
            try {
              let data = JSON.parse(response.responseText)

              resolve(data)
            } catch (e) {
              reject(e)
            }
          },
          onerror: function (e) {
            reject(e)
          }
        }

        GM.xmlHttpRequest(req)
      })
    }
  }

  async function getDataBulk(ids) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "GET",
        url: `https://search.yiff.today/checksource/bulk?ids=${ids.join(",")}`,
        onload: function (response) {
          try {
            let data = JSON.parse(response.responseText)

            resolve(data)
          } catch (e) {
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }

      GM.xmlHttpRequest(req)
    })
  }

  async function anyLinksSupported(links) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "POST",
        url: `https://search.yiff.today/checksource/checksupported`,
        headers: {
          "Content-Type": "application/json"
        },
        data: JSON.stringify(links),
        onload: function (response) {
          try {
            let data = JSON.parse(response.responseText)

            resolve(data.supported)
          } catch (e) {
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }

      GM.xmlHttpRequest(req)
    })
  }

  async function checkFluffleLinks(id, links) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "POST",
        url: `https://search.yiff.today/checksource/checkextra/${id}`,
        headers: {
          "Content-Type": "application/json"
        },
        data: JSON.stringify(links),
        onload: function (response) {
          try {
            resolve(JSON.parse(response.responseText))
          } catch (e) {
            console.error(response.responseText)
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }

      GM.xmlHttpRequest(req)
    })
  }

  async function update(id) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "GET",
        url: `https://search.yiff.today/checksource/update/${id}?waitfordata=true&forceupdate=true`,
        onload: function (response) {
          try {
            let data = JSON.parse(response.responseText)

            resolve(data)
          } catch (e) {
            reject(e)
          }
        },
        onerror: function (e) {
          reject(e)
        }
      }

      GM.xmlHttpRequest(req)
    })
  }

  function approximateAspectRatio(val, lim) {
    let lower = [0, 1]
    let upper = [1, 0]

    while (true) {
      let mediant = [lower[0] + upper[0], lower[1] + upper[1]]

      if (val * mediant[1] > mediant[0]) {
        if (lim < mediant[1]) {
          return upper
        }
        lower = mediant
      } else if (val * mediant[1] == mediant[0]) {
        if (lim >= mediant[1]) {
          return mediant
        }
        if (lower[1] < upper[1]) {
          return lower
        }
        return upper;
      } else {
        if (lim < mediant[1]) {
          return lower
        }
        upper = mediant
      }
    }
  }

  function roundTo(x, n) {
    let power = 10 ** n
    return Math.floor(x * power) / power
  }

  async function addKemonoData() {
    let kemonoData = await getPostKemonoData()

    if (kemonoData?.posts) {
      let first = kemonoData.posts[0]
      let links = document.querySelector(".source-links")

      let kemonoIconClone = kemonoIcon.cloneNode()
      kemonoIconClone.style.cursor = "pointer"
      kemonoIconClone.addEventListener("click", () => {
        window.open(`https://kemono.su/${first.service}/user/${first.user}/post/${first.id}`)
      })

      links.insertBefore(kemonoIconClone, links.firstElementChild)
      return
    }
  }

  async function getBlueskyDid(handle) {
    try {
      let data = await new Promise((resolve, reject) => {
        let req = {
          method: "GET",
          url: `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handle}`,
          onload: function (response) {
            try {
              let data = JSON.parse(response.responseText)

              resolve(data)
            } catch (e) {
              reject(e)
            }
          },
          onerror: function (e) {
            reject(e)
          }
        }

        GM.xmlHttpRequest(req)
      })

      return data.did
    } catch (e) {
      console.error(e)
    }

    return null
  }

  async function getReplacementUrl(id, sourceData, source, reason) {
    let regexData = null
    if ((regexData = /https:\/\/bsky\.app\/profile\/(.*)\/post/.exec(source)) != null) {
      if (!regexData[1].startsWith("did:plc:")) {
        let did = await getBlueskyDid(regexData[1])

        if (did) source = source.replace(regexData[1], did)
      }
    }

    return `https://e621.net/post_replacements/new?post_id=${id}&url=${encodeURIComponent(sourceData.originalUrl)}&reason=${encodeURIComponent('[JSV] ' + reason)}&source=${encodeURIComponent(source)}`
  }

  async function processData(data, refreshable = true, containerSelector = ".source-links") {
    if (data.unsupported) return false

    let id = document.querySelector("#image-container[data-id]").getAttribute("data-id")
    if (data.notPending && refreshable) {
      let links = document.querySelector(containerSelector)
      let linkHrefs = Array.from(links.querySelectorAll("a")).map(a => a.href)

      let supported = data.supported

      if (!supported && linkHrefs.length > 0) {
        if (await anyLinksSupported(linkHrefs)) supported = true
      }

      if (supported) {
        let links = document.querySelector(containerSelector)
        let forceClone = force.cloneNode()
        forceClone.addEventListener("click", async () => {
          for (let ele of document.querySelectorAll(".jsv-icon")) {
            ele.remove()
          }
          forceClone.remove()
          let links = document.querySelector(containerSelector)
          let spinny = spinner.cloneNode()
          links.insertBefore(spinny, links.firstElementChild)
          let data = await getData(id, true, true)
          spinny.remove()
          processData(data)
        })
        links.insertBefore(forceClone, links.firstElementChild)
      }

      return supported
    }

    if (data.queued && refreshable) {
      let links = document.querySelector(containerSelector)
      links.insertBefore(spinner.cloneNode(), links.firstElementChild)

      if (RETRY_COUNT >= 5) return true;

      getData(id, true, true).then(data => {
        RETRY_COUNT++
        for (let ele of document.querySelectorAll(".jsv-icon")) {
          ele.remove()
        }

        processData(data)
      })

      return true
    } else if (data.unsupported && refreshable) {
      let links = document.querySelector(containerSelector)
      let linkHrefs = Array.from(links.querySelectorAll("a")).map(a => a.href)

      if (linkHrefs.length > 0) {
        if (await anyLinksSupported(linkHrefs)) {
          let forceClone = force.cloneNode()
          forceClone.addEventListener("click", async () => {
            for (let ele of document.querySelectorAll(".jsv-icon")) {
              ele.remove()
            }
            forceClone.remove()
            let links = document.querySelector(containerSelector)
            let spinny = spinner.cloneNode()
            links.insertBefore(spinny, links.firstElementChild)
            let data = await getData(id, true, true)
            spinny.remove()
            processData(data)
          })
          links.insertBefore(forceClone, links.firstElementChild)
        }
      }

      let noMatchesClone = noMatches.cloneNode()
      noMatchesClone.title = "Unsupported"
      links.insertBefore(noMatchesClone, links.firstElementChild)
      return true
    }

    let links = document.querySelector(containerSelector)

    if (refreshable) {
      let reloadClone = reload.cloneNode()
      reloadClone.addEventListener("click", async () => {
        for (let ele of document.querySelectorAll(".jsv-icon")) {
          ele.remove()
        }
        reloadClone.remove()
        let links = document.querySelector(containerSelector)
        let spinny = spinner.cloneNode()
        links.insertBefore(spinny, links.firstElementChild)
        let data = await update(id)
        spinny.remove()
        processData(data)
      })
      links.insertBefore(reloadClone, links.firstElementChild)
    }

    let allSourceLinks = Array.from(document.querySelector(containerSelector).querySelectorAll(".source-link > a[href]"))

    let width = parseInt(document.querySelector("span[itemprop='width']").innerText)
    let height = parseInt(document.querySelector("span[itemprop='height']").innerText)
    let fileType = document.querySelector("[data-file-ext]").getAttribute("data-file-ext")

    let approxAspectRatio = approximateAspectRatio(width / height, 50)

    for (let [source, sourceData] of Object.entries(data)) {
      let matchingSourceEntry = allSourceLinks.find(e => decodeURI(e.href) == source || e.href == source)

      if (matchingSourceEntry) {

        let embeddedInfo = info.cloneNode(true)

        let matchingAspectRatio = false

        if (sourceData.dimensions) {
          let sourceApproxAspectRatio = approximateAspectRatio(width / height, 50)
          matchingAspectRatio = approxAspectRatio[0] == sourceApproxAspectRatio[0] && approxAspectRatio[1] == sourceApproxAspectRatio[1]

          embeddedInfo.title = `${sourceData.dimensions.width}x${sourceData.dimensions.height} (${roundTo(sourceData.dimensions.width / width, 2)}:${roundTo(sourceData.dimensions.height / height, 2)}) ${sourceData.fileType.toUpperCase()}`
          matchingSourceEntry.prepend(embeddedInfo)
        } else {
          embeddedInfo.title = `UNK`
          matchingSourceEntry.prepend(embeddedInfo)
        }


        if (!sourceData.md5Match && sourceData.phashDistance !== undefined) {
          let phashClone = phashMatch.cloneNode(true)

          if (sourceData.phashDistance == 0) {
            embeddedInfo.after(phashClone)
          } else if (sourceData.phashDistance < 7) {
            phashClone.style.color = colors["yellow"][colorIndex]
            // phashClone.style.outlineColor = colors["yellow"][colorIndex]
            phashClone.title = "Perceptually similar"
            embeddedInfo.after(phashClone)
          } else {
            phashClone.style.color = colors["red"][colorIndex]
            // phashClone.style.outlineColor = colors["red"][colorIndex]
            phashClone.title = "Perceptually dissimilar"
            embeddedInfo.after(phashClone)
          }

          let pd = 100 - (sourceData.phashDistance / 64 * 100)
          phashClone.title += ` Similarity: ${Math.floor(pd.toFixed(2))}%`
        }

        if (sourceData.md5Match) {
          embeddedInfo.after(md5Match.cloneNode(true))
        } else if (sourceData.dimensionMatch && sourceData.fileTypeMatch) {
          embeddedInfo.after(dimensionAndFileTypeMatch.cloneNode(true))
        } else if (sourceData.dimensionMatch) {
          embeddedInfo.after(dimensionMatch.cloneNode(true))
        } else if (matchingAspectRatio) {
          if (sourceData.fileTypeMatch) {
            let clone = aspectRatioMatch.cloneNode(true)
            clone.title += " file type match"
            clone.style.color = colors["lime"][colorIndex]
            embeddedInfo.after(clone)
          } else {
            let clone = aspectRatioMatch.cloneNode(true)
            clone.title += " different file type"
            clone.style.color = colors["yellow"][colorIndex]
            embeddedInfo.after(clone)
          }
        } else if (sourceData.fileTypeMatch) {
          embeddedInfo.after(fileTypeMatch.cloneNode(true))
        } else if (sourceData.unknown) {
          embeddedInfo.after(unknown.cloneNode(true))
        } else {
          embeddedInfo.after(noMatches.cloneNode(true))
        }

        if (sourceData.isPreview) {
          let clone = bvas.cloneNode(true)
          clone.title = `Matched version is preview image. Original version available.`
          clone.style.color = colors["red"][colorIndex]

          let a = document.createElement("a")
          a.classList.add("jsv-replacement-anchor")
          a.target = "_blank"
          a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
          a.appendChild(clone)

          if (sourceData.originalUrl) {
            a.href = await getReplacementUrl(id, sourceData, source, "Original version")
          }

          matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
        }

        if (sourceData.dimensions && sourceData.fileType) {
          if (sourceData.dimensions.width > width && sourceData.dimensions.height > height) {
            if (fileType == "jpg" && sourceData.fileType == "png") {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger dimensions, PNG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

              let a = document.createElement("a")
              a.classList.add("jsv-replacement-anchor")
              a.target = "_blank"
              a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
              a.appendChild(clone)

              if (sourceData.originalUrl)
                a.href = await getReplacementUrl(id, sourceData, source, "Original version")
              else
                a.href = await getReplacementUrl(id, sourceData, source, "Bigger dimensions, PNG")

              matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
            } else if (fileType == "png" && sourceData.fileType == "jpg") {
              if (sourceData.dimensions.width >= width * 3 && sourceData.dimensions.height >= height * 3) {
                let clone = bvas.cloneNode(true)
                clone.title = `3x size, JPG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

                let a = document.createElement("a")
                a.classList.add("jsv-replacement-anchor")
                a.target = "_blank"
                a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
                a.appendChild(clone)

                if (sourceData.originalUrl)
                  a.href = await getReplacementUrl(id, sourceData, source, "Original version")
                else
                  a.href = await getReplacementUrl(id, sourceData, source, "3x size, JPG")

                matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
              } else if (sourceData.dimensions.width >= width * 2 && sourceData.dimensions.height >= height * 2) {
                let clone = bvas.cloneNode(true)
                clone.style.color = colors["yellow"][colorIndex]
                clone.title = `2x size, JPG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

                let a = document.createElement("a")
                a.classList.add("jsv-replacement-anchor")
                a.target = "_blank"
                a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
                a.appendChild(clone)

                if (sourceData.originalUrl)
                  a.href = await getReplacementUrl(id, sourceData, source, "Original version")
                else
                  a.href = await getReplacementUrl(id, sourceData, source, "2x size, JPG")

                matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
              }
            } else if (fileType == sourceData.fileType) {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger (${sourceData.fileType.toUpperCase()}) ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

              let a = document.createElement("a")
              a.classList.add("jsv-replacement-anchor")
              a.target = "_blank"
              a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
              a.appendChild(clone)

              if (sourceData.originalUrl)
                a.href = await getReplacementUrl(id, sourceData, source, "Original version")
              else
                a.href = await getReplacementUrl(id, sourceData, source, "Higher resolution")

              matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
            }
          } else if (fileType == "jpg" && sourceData.fileType == "png") {
            if (width <= sourceData.dimensions.width * 1.5 && height <= sourceData.dimensions.height * 1.5) {
              let clone = bvas.cloneNode(true)
              clone.title = `PNG Version ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

              let a = document.createElement("a")
              a.classList.add("jsv-replacement-anchor")
              a.target = "_blank"
              a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
              a.appendChild(clone)

              if (sourceData.originalUrl)
                a.href = await getReplacementUrl(id, sourceData, source, "Original version")
              else
                a.href = await getReplacementUrl(id, sourceData, source, "PNG version")

              matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
            }
          } else if (fileType == sourceData.fileType) {
            if (sourceData.dimensions.width > width || sourceData.dimensions.height > height) {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger (${sourceData.fileType.toUpperCase()}) ${sourceData.dimensions.width}x${sourceData.dimensions.height}`

              let a = document.createElement("a")
              a.classList.add("jsv-replacement-anchor")
              a.target = "_blank"
              a.setAttribute("data-replacement-url", sourceData.originalUrl ? sourceData.originalUrl : sourceData.url)
              a.appendChild(clone)

              if (sourceData.originalUrl)
                a.href = await getReplacementUrl(id, sourceData, source, "Original version")
              else
                a.href = await getReplacementUrl(id, sourceData, source, "Higher resolution")

              matchingSourceEntry.insertBefore(a, matchingSourceEntry.children[2])
            }
          }
        }
      }
    }

    return true
  }

  function processDataOnPostView(data) {
    let post = document.getElementById(`entry_${data.id}`)
    let postInfo = post.querySelector("post-info")

    let container = postInfo.querySelector('.jsv-container')
    if (container) container.remove()

    container = document.createElement('div')
    container.classList.add('jsv-container')
    container.style['text-wrap'] = 'nowrap'


    if (data.queued) {
      container.appendChild(spinner.cloneNode())
      postInfo.appendChild(container)
      return
    } else if (data.unsupported) {
      let noMatchesClone = noMatches.cloneNode()
      noMatchesClone.title = "Unsupported"
      container.appendChild(noMatchesClone)
      postInfo.appendChild(container)
      return
    }

    let flags = 0
    let previewMatched = false

    if (!data.sources) return

    let closestPerceptually = null

    for (let [source, sourceData] of Object.entries(data.sources)) {
      if (sourceData.md5Match) {
        flags |= 1
      } else if (sourceData.dimensionMatch && sourceData.fileTypeMatch) {
        flags |= 2
      } else if (sourceData.dimensionMatch) {
        flags |= 4
      } else if (sourceData.fileTypeMatch) {
        flags |= 8
      } else if (sourceData.unknown) {
        flags |= 16
      } else {
        flags |= 32
      }

      if (sourceData.isPreview) {
        previewMatched = true
      }

      if (closestPerceptually == null || sourceData.phashDistance < closestPerceptually.phashDistance) {
        closestPerceptually = sourceData
      }
    }

    postInfo.appendChild(container)

    if ((flags & 1) == 1) {
      container.appendChild(md5Match.cloneNode(true))
    } else if ((flags & 2) == 2) {
      container.appendChild(dimensionAndFileTypeMatch.cloneNode(true))
    } else if ((flags & 4) == 4) {
      container.appendChild(dimensionMatch.cloneNode(true))
    } else if ((flags & 8) == 8) {
      container.appendChild(fileTypeMatch.cloneNode(true))
    } else if ((flags & 16) == 16) {
      container.appendChild(unknown.cloneNode(true))
    } else if ((flags & 32) == 32) {
      container.appendChild(noMatches.cloneNode(true))
    }

    if (!closestPerceptually.md5Match && closestPerceptually.phashDistance !== undefined) {
      let phashClone = phashMatch.cloneNode(true)

      if (closestPerceptually.phashDistance == 0) {
        container.appendChild(phashClone)
      } else if (closestPerceptually.phashDistance < 7) {
        phashClone.style.color = colors["yellow"][colorIndex]
        // phashClone.style.outlineColor = colors["yellow"][colorIndex]
        phashClone.title = "Perceptually similar"
        container.appendChild(phashClone)
      } else {
        phashClone.style.color = colors["red"][colorIndex]
        // phashClone.style.outlineColor = colors["red"][colorIndex]
        phashClone.title = "Perceptually dissimilar"
        container.appendChild(phashClone)
      }

      let pd = 100 - (closestPerceptually.phashDistance / 64 * 100)
      phashClone.title += ` Similarity: ${Math.floor(pd.toFixed(2))}%`
    }

    if (previewMatched) {
      let clone = bvas.cloneNode(true)
      clone.title = `Matched version is preview image. Original version available.`
      clone.style.color = colors["red"][colorIndex]
      container.appendChild(clone)

      if (flags == 0) postInfo.appendChild(container)
    }
  }

  let timeOfMostRecentAddition = -1
  let additions = []

  let interval

  function checkForNewPosts(mutationList, observer) {
    for (const mutation of mutationList) {
      if (mutation.type === "childList") {
        for (let addedNode of mutation.addedNodes) {
          if (addedNode.tagName == "IMG-RIBBONS") {
            timeOfMostRecentAddition = Date.now()
            additions.push(mutation.target)
            if (!interval && additions.length > 0) {
              interval = setInterval(async () => {
                if (Date.now() - timeOfMostRecentAddition > 500) {
                  clearInterval(interval)
                  interval = null

                  let ids = additions.map(p => p.id.slice(6))

                  additions = []

                  let datas = await getDataBulk(ids)

                  for (let data of datas) {
                    processDataOnPostView(data)
                  }
                }
              }, 300)
            }
          }
        }
      }
    }
  }
  if (window.location.pathname == "/posts") {
    let observer = new MutationObserver(checkForNewPosts)
    observer.observe(await waitForSelector("search-content"), { attributes: true, childList: true, subtree: true })
    return
  }

  let id = document.querySelector("#image-container[data-id]").getAttribute("data-id")
  try {
    let data = await getData(id)

    let links = Array.from(document.querySelectorAll(".source-link")).map(a => a.href)

    let supported = await processData(data, links.length > 0)

    if (links.length == 0) {
      addKemonoData()
      checkFluffle();
    } else if (!supported) {
      checkFluffle()
    }

  } catch (e) {
    console.error(e)
  }

})();

