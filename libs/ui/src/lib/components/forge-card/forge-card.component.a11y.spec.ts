import { TestBed, ComponentFixture } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ForgeCardComponent } from './forge-card.component';

expect.extend(toHaveNoViolations);

describe('ForgeCardComponent – accessibility', () => {
  let fixture: ComponentFixture<ForgeCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgeCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgeCardComponent);
    fixture.componentRef.setInput('title', 'Test Card');
    fixture.detectChanges();
  });

  it('has no axe violations', async () => {
    const results = await axe(fixture.nativeElement);
    expect(results).toHaveNoViolations();
  });

  it('renders the card title', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Card');
  });

  it('renders without a title when title is empty', async () => {
    fixture.componentRef.setInput('title', '');
    fixture.detectChanges();
    const results = await axe(fixture.nativeElement);
    expect(results).toHaveNoViolations();
  });
});
