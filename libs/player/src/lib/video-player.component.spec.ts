import { detectVideoKind } from './video-player.component';

describe('detectVideoKind', () => {
  describe('YouTube URLs', () => {
    it('detects standard watch URL', () => {
      expect(detectVideoKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    });

    it('detects short youtu.be URL', () => {
      expect(detectVideoKind('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    });

    it('detects embed URL', () => {
      expect(detectVideoKind('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('youtube');
    });

    it('detects YouTube Shorts URL', () => {
      expect(detectVideoKind('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('youtube');
    });

    it('detects YouTube with extra query params', () => {
      expect(detectVideoKind('https://www.youtube.com/watch?v=abc1234ABCD&t=42')).toBe('youtube');
    });
  });

  describe('Vimeo URLs', () => {
    it('detects standard vimeo URL', () => {
      expect(detectVideoKind('https://vimeo.com/123456789')).toBe('vimeo');
    });

    it('detects vimeo with path segments', () => {
      expect(detectVideoKind('https://player.vimeo.com/video/987654321')).toBe('vimeo');
    });

    it('detects vimeo with www', () => {
      expect(detectVideoKind('https://www.vimeo.com/111222333')).toBe('vimeo');
    });
  });

  describe('File URLs', () => {
    it('detects direct mp4 URL as file', () => {
      expect(detectVideoKind('https://cdn.example.com/videos/lesson.mp4')).toBe('file');
    });

    it('detects direct webm URL as file', () => {
      expect(detectVideoKind('https://cdn.example.com/videos/lesson.webm')).toBe('file');
    });

    it('detects HLS m3u8 URL as file', () => {
      expect(detectVideoKind('https://stream.example.com/hls/video.m3u8')).toBe('file');
    });

    it('returns file for empty string', () => {
      expect(detectVideoKind('')).toBe('file');
    });

    it('returns file for random string', () => {
      expect(detectVideoKind('not a url at all')).toBe('file');
    });
  });
});
