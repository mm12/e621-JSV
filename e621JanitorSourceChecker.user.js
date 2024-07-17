// ==UserScript==
// @name         e621 Janitor Source Checker
// @version      0.18
// @description  Tells you if a pending post matches its source.
// @author       Tarrgon
// @match        https://e621.net/posts/*
// @updateURL    https://github.com/DontTalkToMeThx/e621JanitorSourceChecker/releases/latest/download/e621JanitorSourceChecker.user.js
// @downloadURL  https://github.com/DontTalkToMeThx/e621JanitorSourceChecker/releases/latest/download/e621JanitorSourceChecker.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=e621.net
// @connect      search.yiff.today
// @connect      static1.e621.net
// @connect      kemono.su
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @run-at       document-end
// ==/UserScript==

(async function () {
  'use strict';
  const colors = {
    "lime": ["lime", "#D833B0"],
    "yellow": ["yellow", "#FEFE62"],
    "red": ["red", "#FFA745"]
  }

  if (!(await GM.getValue("colorBlindMode"))) {
    await GM.setValue("colorBlindMode", "false")
  }

  let colorIndex = await GM.getValue("colorBlindMode", "false") == "false" ? 0 : 1

  const md5Match = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check-double", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.title = "MD5 match"
    return i
  })();

  const dimensionAndFileTypeMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.title = "Dimension and file type match"
    return i
  })();

  const dimensionMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-check", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "Dimension match"
    return i
  })();

  const aspectRatioMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-square", "jsv-icon")
    i.title = "Approx. aspect ratio match"
    return i
  })();

  const fileTypeMatch = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-xmark", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "File type match"
    return i
  })();

  const noMatches = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-xmark", "jsv-icon")
    i.style.color = colors["red"][colorIndex]
    i.title = "No matches"
    return i
  })();

  const spinner = (() => {
    let i = document.createElement("i")
    i.classList.add("fa-solid", "fa-spinner", "fa-spin", "jsv-icon")
    i.style.color = "yellow"
    i.title = "Queued"
    return i
  })();

  const unknown = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-question", "jsv-icon")
    i.style.color = colors["yellow"][colorIndex]
    i.title = "Unknown"
    return i
  })();

  const bvas = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-plus", "jsv-icon")
    i.style.color = colors["lime"][colorIndex]
    i.style.marginRight = "0.25rem"
    i.style.marginLeft = "0.25rem"
    return i
  })();

  const info = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-circle-info", "jsv-icon")
    i.style.color = "cyan"
    i.style.marginRight = "0.25rem"
    return i
  })();

  const force = (() => {
    let i = document.createElement("i")
    i.classList.add("fa", "fa-angles-down", "jsv-icon")
    i.style.color = "green"
    i.style.cursor = "pointer"
    i.title = "Get source data"
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
        url: `https://kemono.su/api/v1/search_hash/${hash}`,
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

  async function getData(id, force = false) {
    if (!force) {
      return new Promise((resolve, reject) => {
        let req = {
          method: "GET",
          url: `https://search.yiff.today/checksource/${id}`,
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
          url: `https://search.yiff.today/checksource/${id}?checkapproved=true&waitfordata=true`,
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

  async function update(id) {
    return new Promise((resolve, reject) => {
      let req = {
        method: "GET",
        url: `https://search.yiff.today/checksource/update/${id}?waitfordata=true`,
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

  function processData(data) {
    let allLi = Array.from(document.getElementById("post-information").querySelectorAll("li"))
    let id = allLi.find(e => e.innerText.startsWith("ID:")).innerText.slice(4)
    if (data.notPending) {
      let links = document.querySelector(".source-links")
      let forceClone = force.cloneNode()
      forceClone.addEventListener("click", async () => {
        forceClone.remove()
        let links = document.querySelector(".source-links")
        let spinny = spinner.cloneNode()
        links.insertBefore(spinny, links.firstElementChild)
        let data = await getData(id, true)
        spinny.remove()
        processData(data)
      })
      links.insertBefore(forceClone, links.firstElementChild)
      return
    }

    if (data.queued) {
      let links = document.querySelector(".source-links")
      links.insertBefore(spinner.cloneNode(), links.firstElementChild)
      return
    } else if (data.unsupported) {
      let links = document.querySelector(".source-links")
      let noMatchesClone = noMatches.cloneNode()
      noMatchesClone.title = "Unsupported"
      links.insertBefore(noMatchesClone, links.firstElementChild)
      return
    }

    let links = document.querySelector(".source-links")
    let reloadClone = reload.cloneNode()
    reloadClone.addEventListener("click", async () => {
      for (let ele of document.querySelectorAll(".jsv-icon")) {
        ele.remove()
      }
      reloadClone.remove()
      let links = document.querySelector(".source-links")
      let spinny = spinner.cloneNode()
      links.insertBefore(spinny, links.firstElementChild)
      let data = await update(id)
      spinny.remove()
      processData(data)
    })
    links.insertBefore(reloadClone, links.firstElementChild)

    let allSourceLinks = Array.from(document.getElementById("post-information").querySelectorAll(".source-link"))

    let width = parseInt(document.querySelector("span[itemprop='width']").innerText)
    let height = parseInt(document.querySelector("span[itemprop='height']").innerText)
    let fileType = allLi.find(e => e.innerText.trim().startsWith("Type:")).innerText.trim().slice(6).toLowerCase()

    let approxAspectRatio = approximateAspectRatio(width / height, 50)

    for (let [source, sourceData] of Object.entries(data)) {
      let matchingSourceEntry = allSourceLinks.find(e => decodeURI(e.children[0].href) == source || e.children[0].href == source)
      console.log(matchingSourceEntry)

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
          matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
        }

        if (sourceData.dimensions && sourceData.fileType) {
          if (sourceData.dimensions.width > width && sourceData.dimensions.height > height) {
            if (fileType == "jpg" && sourceData.fileType == "png") {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger dimensions, PNG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
              matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
            } else if (fileType == "png" && sourceData.fileType == "jpg") {
              if (sourceData.dimensions.width >= width * 3 && sourceData.dimensions.height >= height * 3) {
                let clone = bvas.cloneNode(true)
                clone.title = `3x size, JPG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
                matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
              } else if (sourceData.dimensions.width >= width * 2 && sourceData.dimensions.height >= height * 2) {
                let clone = bvas.cloneNode(true)
                clone.style.color = colors["yellow"][colorIndex]
                clone.title = `2x size, JPG ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
                matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
              }
            } else if (fileType == sourceData.fileType) {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger (${sourceData.fileType.toUpperCase()}) ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
              matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
            }
          } else if (fileType == "jpg" && sourceData.fileType == "png") {
            if (width <= sourceData.dimensions.width * 1.5 && height <= sourceData.dimensions.height * 1.5) {
              let clone = bvas.cloneNode(true)
              clone.title = `PNG Version ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
              matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
            }
          } else if (fileType == sourceData.fileType) {
            if (sourceData.dimensions.width > width || sourceData.dimensions.height > height) {
              let clone = bvas.cloneNode(true)
              clone.title = `Bigger (${sourceData.fileType.toUpperCase()}) ${sourceData.dimensions.width}x${sourceData.dimensions.height}`
              matchingSourceEntry.insertBefore(clone, matchingSourceEntry.children[2])
            }
          }
        }
      }
    }
  }

  let allLi = Array.from(document.getElementById("post-information").querySelectorAll("li"))
  let id = allLi.find(e => e.innerText.startsWith("ID:")).innerText.slice(4)
  try {
    let data = await getData(id)

    processData(data)

    if (document.querySelectorAll(".source-link").length == 0) {
      let kemonoData = await getPostKemonoData()

      if (kemonoData) {
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

  } catch (e) {
    console.error(e)
  }
})();