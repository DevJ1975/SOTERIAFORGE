import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/** Detects the kind of video URL: YouTube, Vimeo, or a plain file. */
export function detectVideoKind(url: string): 'youtube' | 'vimeo' | 'file' {
  const youtubeRegex =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const vimeoRegex = /(?:vimeo\.com\/(?:video\/)?)([0-9]+)/;

  if (youtubeRegex.test(url)) return 'youtube';
  if (vimeoRegex.test(url)) return 'vimeo';
  return 'file';
}

/** Converts a YouTube watch/short URL to an embed URL. */
function toYouTubeEmbed(url: string): string {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  const id = match ? match[1] : '';
  return `https://www.youtube.com/embed/${id}`;
}

/** Converts a Vimeo URL to an embed URL. */
function toVimeoEmbed(url: string): string {
  const match = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
  const id = match ? match[1] : '';
  return `https://player.vimeo.com/video/${id}`;
}

@Component({
  selector: 'forge-video-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kind === 'youtube' || kind === 'vimeo') {
      <div class="forge-video-player__embed-wrapper">
        <iframe
          class="forge-video-player__iframe"
          [src]="safeEmbedUrl"
          [title]="title() ?? 'Video'"
          frameborder="0"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        ></iframe>
      </div>
    } @else {
      <!-- HTML5 native video -->
      <video
        #videoEl
        class="forge-video-player__native"
        controls
        [title]="title() ?? 'Video'"
      >
        <source [src]="url()" />
        Your browser does not support the video element.
      </video>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .forge-video-player__embed-wrapper {
        position: relative;
        padding-top: 56.25%; /* 16:9 */
        height: 0;
        overflow: hidden;
      }
      .forge-video-player__iframe {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }
      .forge-video-player__native {
        display: block;
        width: 100%;
        max-height: 70vh;
        background: #000;
      }
    `,
  ],
})
export class VideoPlayerComponent {
  readonly url = input.required<string>();
  readonly title = input<string | undefined>(undefined);

  readonly progress = output<number>();
  readonly completed = output<void>();

  @ViewChild('videoEl') private videoEl?: ElementRef<HTMLVideoElement>;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  get kind(): 'youtube' | 'vimeo' | 'file' {
    return detectVideoKind(this.url());
  }

  get safeEmbedUrl(): SafeResourceUrl {
    const rawUrl =
      this.kind === 'youtube' ? toYouTubeEmbed(this.url()) : toVimeoEmbed(this.url());
    return this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl);
  }

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.attachVideoListeners();
    });
  }

  private attachVideoListeners(): void {
    const el = this.videoEl?.nativeElement;
    if (!el) return;

    el.addEventListener('timeupdate', () => {
      if (!el.duration || isNaN(el.duration)) return;
      const pct = Math.round((el.currentTime / el.duration) * 100);
      this.progress.emit(pct);
    });

    el.addEventListener('ended', () => {
      this.completed.emit();
    });
  }
}
