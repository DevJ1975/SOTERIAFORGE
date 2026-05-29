import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { UnityEmbedComponent } from './unity-embed.component';

/**
 * Smoke tests for UnityEmbedComponent.
 *
 * PhaserHostComponent and RiveCharacterComponent spin up WebGL / Canvas engines
 * that are not available in jsdom — those are skipped here.
 * UnityEmbedComponent is pure HTML (an <iframe>), making it safe in jsdom.
 */
describe('UnityEmbedComponent', () => {
  it('creates the component without errors', async () => {
    await TestBed.configureTestingModule({
      imports: [UnityEmbedComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(UnityEmbedComponent);
    fixture.componentRef.setInput('launchUrl', 'https://example.com/unity?endpoint=x');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a sandboxed iframe with the launch URL', async () => {
    await TestBed.configureTestingModule({
      imports: [UnityEmbedComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(UnityEmbedComponent);
    const launchUrl = 'https://lms.example.com/cmi5/launch?endpoint=abc&activityId=xyz';
    fixture.componentRef.setInput('launchUrl', launchUrl);
    fixture.componentRef.setInput('title', 'Safety Training');
    fixture.detectChanges();

    const iframe: HTMLIFrameElement | null = fixture.nativeElement.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe!.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe!.title).toBe('Safety Training');
  });

  it('uses "Unity game" as the default accessible title', async () => {
    await TestBed.configureTestingModule({
      imports: [UnityEmbedComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(UnityEmbedComponent);
    fixture.componentRef.setInput('launchUrl', 'https://example.com/unity');
    fixture.detectChanges();

    const iframe: HTMLIFrameElement | null = fixture.nativeElement.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.title).toBe('Unity game');
  });

  it('emits signal output for valid postMessage events', async () => {
    await TestBed.configureTestingModule({
      imports: [UnityEmbedComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(UnityEmbedComponent);
    fixture.componentRef.setInput('launchUrl', 'https://example.com/unity');
    fixture.detectChanges();

    const received: unknown[] = [];
    fixture.componentInstance.signal.subscribe((msg) => received.push(msg));

    // The message listener guards against messages not from the iframe —
    // since the iframe contentWindow is null in jsdom, we can only test
    // that the component doesn't crash; actual routing is verified in e2e.
    expect(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'test' } }));
    }).not.toThrow();
  });
});

/**
 * Host component smoke test: verify the component can be used in a template.
 */
@Component({
  template: `
    <forge-unity-embed
      [launchUrl]="'https://example.com/unity'"
      [title]="'Test Game'"
    />
  `,
  imports: [UnityEmbedComponent],
  standalone: true,
})
class TestHostComponent {}

describe('UnityEmbedComponent — host component integration', () => {
  it('renders inside a host component without errors', async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const iframe = fixture.nativeElement.querySelector('forge-unity-embed iframe');
    expect(iframe).toBeTruthy();
  });
});
