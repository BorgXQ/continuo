export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aif', 'aiff', 'webm'];
export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map(extension => `.${extension}`).join(',');
export function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(name.split('.').pop()?.toLowerCase() ?? '');
}
