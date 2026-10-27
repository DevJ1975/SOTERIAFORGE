import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  SF_ICON_NAMES,
  SF_ICON_SPRITE_URL,
  SfIconComponent,
  type SfIconName,
} from './sf-icon.component';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

expect.extend(toHaveNoViolations);

@Component({
  standalone: true,
  imports: [SfIconComponent],
  template: `<button type="button" aria-label="Home"><sf-icon [name]="name()" /></button>
    <p>Status <sf-icon name="lock" size="sm" [label]="label()" /></p>`,
})
class HostComponent {
  readonly name = signal<SfIconName>('home');
  readonly label = signal('Locked');
}

describe('SfIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('references the kit sprite symbol for the given name', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const use = fixture.nativeElement.querySelector('button use') as SVGUseElement;
    expect(use.getAttribute('href')).toBe('assets/forge/icons/_sprite.svg#sf-home');

    fixture.componentInstance.name.set('flame');
    fixture.detectChanges();
    expect(use.getAttribute('href')).toBe('assets/forge/icons/_sprite.svg#sf-flame');
  });

  it('is decorative (aria-hidden, no role) when no label is given', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('button svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  it('exposes role="img" + aria-label when labelled', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('p svg') as SVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Locked');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.classList).toContain('sf-icon--sm');
  });

  it('uses the kit stroke spec (1.8, round caps/joins, currentColor)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.8');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('honours an overridden sprite URL', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: SF_ICON_SPRITE_URL, useValue: '/cdn/sprite.svg' }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const use = fixture.nativeElement.querySelector('use') as SVGUseElement;
    expect(use.getAttribute('href')).toBe('/cdn/sprite.svg#sf-home');
  });

  it('has no axe violations', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(await axe(fixture.nativeElement)).toHaveNoViolations();
  });

  it('lists exactly the symbols shipped in the kit sprite', () => {
    const sprite = readFileSync(join(__dirname, '../../assets/forge/icons/_sprite.svg'), 'utf8');
    const ids = [...sprite.matchAll(/<symbol id="sf-([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    expect([...SF_ICON_NAMES].sort()).toEqual(ids);
  });
});
