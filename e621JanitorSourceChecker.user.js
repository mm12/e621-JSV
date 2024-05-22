// ==UserScript==
// @name         e621 Janitor Source Checker
// @version      0.13
// @description  Tells you if a pending post matches its source.
// @author       Tarrgon
// @match        https://e621.net/posts/*
// @updateURL    https://github.com/DontTalkToMeThx/e621JanitorSourceChecker/releases/latest/download/e621JanitorSourceChecker.user.js
// @downloadURL  https://github.com/DontTalkToMeThx/e621JanitorSourceChecker/releases/latest/download/e621JanitorSourceChecker.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=e621.net
// @connect      search.yiff.today
// @grant        GM.xmlHttpRequest
// @run-at       document-end
// ==/UserScript==

const md5Match = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-check-double")
  i.style.color = "lime"
  i.title = "MD5 match"
  return i
})();

const dimensionAndFileTypeMatch = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-check")
  i.style.color = "lime"
  i.title = "Dimension and file type match"
  return i
})();

const dimensionMatch = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-check")
  i.style.color = "yellow"
  i.title = "Dimension match"
  return i
})();

const aspectRatioMatch = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-square")
  i.title = "Approx. aspect ratio match"
  return i
})();

const fileTypeMatch = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-xmark")
  i.style.color = "yellow"
  i.title = "File type match"
  return i
})();

const noMatches = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-xmark")
  i.style.color = "red"
  i.title = "No matches"
  return i
})();

const spinner = (() => {
  let i = document.createElement("i")
  i.classList.add("fa-solid", "fa-spinner", "fa-spin")
  i.style.color = "yellow"
  i.title = "Queued"
  return i
})();

const unknown = (() => {
  let i = document.createElement("i")
  i.classList.add("fa", "fa-question")
  i.style.color = "yellow"
  i.title = "Unknown"
  return i
})();

const bvas = (() => {
  let i = document.createElement("i")
  i.classList.add("fa", "fa-plus")
  i.style.color = "lime"
  i.style.marginRight = "0.25rem"
  i.style.marginLeft = "0.25rem"
  return i
})();

const info = (() => {
  let i = document.createElement("i")
  i.classList.add("fa", "fa-circle-info")
  i.style.color = "cyan"
  i.style.marginRight = "0.25rem"
  return i
})();

async function getData(id) {
  return await new Promise((resolve, reject) => {
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

(async function () {
  'use strict';
  let allLi = Array.from(document.getElementById("post-information").querySelectorAll("li"))
  let isPending = allLi.some(e => e.innerText == "Status: Pending")

  if (!isPending) return

  let id = allLi.find(e => e.innerText.startsWith("ID:")).innerText.slice(4)

  try {
    let data = await getData(id)

    if (data.notPending) return

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

    let allSourceLinks = Array.from(document.getElementById("post-information").querySelectorAll(".source-link"))

    let width = parseInt(document.querySelector("span[itemprop='width']").innerText)
    let height = parseInt(document.querySelector("span[itemprop='height']").innerText)
    let fileType = allLi.find(e => e.innerText.trim().startsWith("Type:")).innerText.trim().slice(6).toLowerCase()

    let approxAspectRatio = approximateAspectRatio(width / height, 50)

    for (let [source, sourceData] of Object.entries(data)) {
      let matchingSourceEntry = allSourceLinks.find(e => decodeURI(e.children[0].href) == source || e.children[0].href == source)

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
            clone.style.color = "lime"
            embeddedInfo.after(clone)
          } else {
            let clone = aspectRatioMatch.cloneNode(true)
            clone.title += " different file type"
            clone.style.color = "yellow"
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
          clone.title = `Uploaded version is preview image. Original version available.`
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
                clone.style.color = "yellow"
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

  } catch (e) {
    console.error(e)
  }
})();