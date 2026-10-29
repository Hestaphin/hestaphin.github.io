export const RESOURCE_FILE_LIMIT = 10 * 1024 * 1024;
export const RESOURCE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function validateResourceFiles(files, images = false) {
  const list = Array.from(files || []);
  if (list.length > 8) throw Error('Choose at most eight images or eight attachments.');
  for (const file of list) {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > RESOURCE_FILE_LIMIT) throw Error('Each resource file must be no larger than 10 MB and cannot be empty.');
    if (images && !RESOURCE_IMAGE_TYPES.includes(file.type)) throw Error('Choose PNG, JPG, WebP or GIF images.');
    if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255) throw Error('Check the file name.');
  }
  return list;
}
export function validateResourceMedia(media, images = false) {
  const list = validateResourceFiles(media, images);
  for (const file of list) if (typeof file.path !== 'string' || file.path.length > 600 || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[\w.\-]+$/i.test(file.path) || file.path.split('/').at(-1) === '..') throw Error('Invalid resource file path.');
  if (new Set(list.map(file => file.path)).size !== list.length) throw Error('A resource file was selected twice.');
  return list.map(({ path, name, type, size }) => ({ path, name, type: images ? type : 'application/octet-stream', size }));
}
