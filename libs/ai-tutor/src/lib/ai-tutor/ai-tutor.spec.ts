import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiTutor } from './ai-tutor';

describe('AiTutor', () => {
  let component: AiTutor;
  let fixture: ComponentFixture<AiTutor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiTutor],
    }).compileComponents();

    fixture = TestBed.createComponent(AiTutor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
