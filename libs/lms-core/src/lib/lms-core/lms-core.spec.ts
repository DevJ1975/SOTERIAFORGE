import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LmsCore } from './lms-core';

describe('LmsCore', () => {
  let component: LmsCore;
  let fixture: ComponentFixture<LmsCore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LmsCore],
    }).compileComponents();

    fixture = TestBed.createComponent(LmsCore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
