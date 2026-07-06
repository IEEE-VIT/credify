# credify

An extension made to help VIT students sync the course allocation report seamlessly !!

## Tech Stack

- Javascript
- Chrome API

## Installing the extension

- Clone the repo or [Download ZIP](https://github.com/IEEE-VIT/credify/archive/refs/heads/main.zip).
  `https://github.com/IEEE-VIT/credify`
- Launch Google Chrome and type `chrome:/extensions/` into the address bar, then hit enter
- Switch on `Developer mode` in the top-right corner
- You would now have an option to `Load unpacked` in the top-left corner
- Click it, then navigate to the cloned repo and select the `extension` folder
- Congratulations, your extension has been successfully installed !!

## Using the extension

- Log in to the registration portal [here](https://vtopreg.vit.ac.in/tablet/checkRegistration)
- That's it — the extension runs on its own, no button to click
- Every minute it checks each registration category and notifies you when:
  - **seats open** in a slot (available count goes from 0 to more than 0)
  - a **new slot** is added to a course
  - a **new course** appears, or a course **becomes open** to register
- The first run just records a baseline; alerts start once something actually changes
- Categories you've already met the credit requirement for are skipped automatically

### Checking logs

Content-script logs are mirrored to the background service worker for reliable viewing:

- Open `chrome://extensions`, find Credify, and click the **service worker** link
- The Console tab shows `[credify] ...` status lines (`sync...`, `sync done: N courses, M slots tracked`, and each alert)

## Getting Started

To get started -

- Clone the repo.
  `https://github.com/IEEE-VIT/credify`
- Checkout to a new branch.
  `git checkout -b my-amazing-feature`
- Make some amazing changes.
- `git add .`
- `git commit -m "<verb> : <action>."`
- `git push origin my-amazing-feature`
- Open a pull request :)

To start contributing, check out [`CONTRIBUTING.md`](https://github.com/IEEE-VIT/credify/blob/main/CONTRIBUTING.md) . New contributors are always welcome to support this project.

## License

This project is licensed under [MIT](https://github.com/IEEE-VIT/credify/blob/master/LICENSE).

<p align="center">Made with ❤ by Harsh Gupta</p>
