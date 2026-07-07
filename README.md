# credify

a chrome extension that watches VIT's course registration page for you.

## what it does

you log into the vtopreg portal once, then the extension checks it every minute for:

- seats opening up in a full slot
- new slots added to a course
- new courses appearing, or a course becoming registerable

sends a desktop notification when any of these happen. no manual refreshing.
You can also see the logs in the service worker console

## tech stack

- javascript
- chrome api

## installing the extension

- clone the repo or [download zip](https://github.com/IEEE-VIT/credify/credify-extension.zip)
  `https://github.com/IEEE-VIT/credify`
- open chrome, go to `chrome://extensions`
- turn on `developer mode` (top right)
- click `load unpacked` (top left)
- select the `extension` folder from the cloned repo
- done, extension installed

## using the extension

- log in at the [registration portal](https://vtopreg.vit.ac.in/tablet/checkRegistration)
- that's it, it runs on its own, no button to click
- first run just records a baseline, no alerts yet
- alerts start once something actually changes
- categories you've already met the credit requirement for get skipped automatically

### checking logs

logs are mirrored to the background service worker console:

- open `chrome://extensions`, find credify, click the `service worker` link
- console tab shows `[credify] ...` lines: sync status, slot counts, each alert

## how to get things rolling

to get started:

- clone the repo
  `https://github.com/IEEE-VIT/credify`
- checkout a new branch
  `git checkout -b my-amazing-feature`
- make your changes
- `git add .`
- `git commit -m "<verb>: <action>"`
- `git push origin my-amazing-feature`
- open a pull request

check out [`CONTRIBUTING.md`](https://github.com/IEEE-VIT/credify/blob/main/CONTRIBUTING.md) to start contributing. new contributors welcome.

## license

licensed under [MIT](https://github.com/IEEE-VIT/credify/blob/master/LICENSE).

<p align="center">Originally made by Harsh Gupta (Updated by Vamsi)</p>
