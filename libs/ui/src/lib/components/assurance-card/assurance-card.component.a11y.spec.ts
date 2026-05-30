import { TestBed, ComponentFixture } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AssuranceCardComponent } from './assurance-card.component';

expect.extend(toHaveNoViolations);

describe('AssuranceCardComponent – accessibility', () => {
  let fixture: ComponentFixture<AssuranceCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssuranceCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AssuranceCardComponent);
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
