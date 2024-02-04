/**
 * This function is same as PHP's nl2br() with default parameters.
 * From: https://gist.github.com/yidas/41cc9272d3dff50f3c9560fb05e7255e
 *
 * @param {string} str Input text
 * @param {boolean} replaceMode Use replace instead of insert
 * @param {boolean} isXhtml Use XHTML 
 * @return {string} Filtered text
 */
export function nl2br (str, replaceMode, isXhtml) {

  var breakTag = (isXhtml) ? '<br />' : '<br>';
  var replaceStr = (replaceMode) ? '$1'+ breakTag : '$1'+ breakTag +'$2';
  return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, replaceStr);
}