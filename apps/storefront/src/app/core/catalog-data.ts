/** A public course listing shown on the storefront catalog. */
export interface CatalogCourse {
  id: string;
  title: string;
  description: string;
}

/**
 * PLACEHOLDER: static list until the backend exposes a public, read-only
 * endpoint for published library courses. Replace with an API call then.
 */
export const PLACEHOLDER_COURSES: readonly CatalogCourse[] = [
  {
    id: 'hazard-communication',
    title: 'Hazard Communication',
    description:
      'Labels, safety data sheets and the right response when a chemical hazard shows up.',
  },
  {
    id: 'lockout-tagout',
    title: 'Lockout / Tagout',
    description: 'Control hazardous energy safely before servicing or maintaining equipment.',
  },
  {
    id: 'forklift-safety',
    title: 'Powered Industrial Truck Safety',
    description: 'Safe operation, load handling and pedestrian awareness around forklifts.',
  },
  {
    id: 'ppe-basics',
    title: 'Personal Protective Equipment',
    description: 'Choosing, wearing and maintaining the PPE a job actually calls for.',
  },
];

/** mailto: link asking the team for access to a course (or to the platform when omitted). */
export function requestAccessHref(contactEmail: string, course?: CatalogCourse): string {
  const subject = course ? `Access request: ${course.title}` : 'Access request';
  const body = course
    ? `Hello,\n\nI would like access to "${course.title}".\n\nName:\nOrganization:\n`
    : 'Hello,\n\nI would like access to Soteria Forge.\n\nName:\nOrganization:\n';
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
