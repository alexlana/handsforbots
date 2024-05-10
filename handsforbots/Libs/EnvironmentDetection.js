export default class EnvironmentDetection {

  constructor ()  {}

  // From: https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browsers
  whatBrowser () {
    if ((navigator.userAgent.indexOf("Opera") || navigator.userAgent.indexOf('OPR')) != -1) {
      return 'Opera'
    } else if (navigator.userAgent.indexOf("Edg") != -1) {
      return 'Edge'
    } else if (navigator.userAgent.indexOf("Chrome") != -1) {
      return 'Chrome'
    } else if (navigator.userAgent.indexOf("Safari") != -1) {
      return 'Safari'
    } else if (navigator.userAgent.indexOf("Firefox") != -1) {
      return 'Firefox'
    } else if ((navigator.userAgent.indexOf("MSIE") != -1) || (!!document.documentMode == true)) //IF IE > 10
    {
      return 'IE'
    } else {
      return 'unknown'
    }
  }

  // From: https://stackoverflow.com/questions/38241480/detect-macos-ios-windows-android-and-linux-os-with-js
  whatOS () {

    const userAgent = window.navigator.userAgent,
      platform = window.navigator?.userAgentData?.platform || window.navigator.platform,
      macosPlatforms = ['macOS', 'Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod']

    if (macosPlatforms.indexOf(platform) !== -1) {
      return 'MacOS'
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      return 'iOS'
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      return 'Windows'
    } else if (/Android/.test(userAgent)) {
      return 'Android'
    } else if (/Linux/.test(platform)) {
      return 'Linux'
    } else {
      return 'unknown'
    }

  }

  // Adapted from here: https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
  whatDeviceType () {

    if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
      return 'Mobile'
    } else {
      return 'Desktop'
    }

  }

}