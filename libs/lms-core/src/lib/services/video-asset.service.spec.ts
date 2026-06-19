// Mock @angular/fire/storage before it (and its heavy @firebase/auth Node
// transitive dependency) is evaluated. The unit under test here is the pure
// path builder; the storage SDK functions are never exercised.
jest.mock('@angular/fire/storage', () => ({
  Storage: class Storage {},
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { VideoAssetService } from './video-asset.service';

describe('VideoAssetService', () => {
  let service: VideoAssetService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: Storage, useValue: {} }],
    });
    service = TestBed.inject(VideoAssetService);
  });

  it('builds the canonical tenant-scoped video object path', () => {
    expect(service.buildVideoPath('atl-airport', 'course-1', 'walkaround.mp4')).toBe(
      'tenants/atl-airport/courses/course-1/videos/walkaround.mp4',
    );
  });

  it('keeps tenant and course ids verbatim in the path', () => {
    expect(service.buildVideoPath('globex', 'c9', 'clip.webm')).toBe(
      'tenants/globex/courses/c9/videos/clip.webm',
    );
  });
});
