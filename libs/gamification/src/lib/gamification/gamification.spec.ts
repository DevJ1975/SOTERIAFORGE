import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Gamification } from './gamification';

describe('Gamification', () => {
  let component: Gamification;
  let fixture: ComponentFixture<Gamification>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gamification],
    }).compileComponents();

    fixture = TestBed.createComponent(Gamification);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
