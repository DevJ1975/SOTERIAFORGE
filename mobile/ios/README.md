# Soteria Assurance — iOS

Native iOS client (Swift · SwiftUI · firebase-ios-sdk).

> **Requires macOS + Xcode.** This app cannot be built on Linux. The sources here
> were authored in a Linux sandbox and have not been compiled — treat the first
> Xcode build as the verification step.

## Prerequisites

- Xcode 15+ (iOS 16 deployment target)
- [XcodeGen](https://github.com/yonixx/XcodeGen) (`brew install xcodegen`) to
  generate the `.xcodeproj` from `project.yml`
- A Firebase project with **Identity Platform multi-tenancy** + Email/Password.

## Setup

1. In the Firebase console, register an iOS app with bundle id
   `com.soteria.assurance` and download `GoogleService-Info.plist`.
2. Place it at `ios/GoogleService-Info.plist` (gitignored — never commit it).
   See `GoogleService-Info.plist.example` for the shape.
3. Generate and open the project:
   ```bash
   cd ios
   xcodegen generate
   open SoteriaAssurance.xcodeproj
   ```
   Xcode resolves the `firebase-ios-sdk` Swift Package on first open.
4. Build & run on a simulator or device.

> Prefer not to use XcodeGen? Create a new SwiftUI App target named
> `SoteriaAssurance` (bundle id `com.soteria.assurance`), add the
> `firebase-ios-sdk` package (products **FirebaseAuth**, **FirebaseFirestore**),
> then add the files under `Sources/` and the plist.

## Architecture

```
Sources/
  Models.swift                 Course · Module · Enrollment · Principal (mirror libs/shared)
  Services/AuthService.swift   GCIP tenant sign-in + ID-token claims
  Services/CourseService.swift tenant-scoped Firestore reads
  ViewModels/                  LoginViewModel · CoursesViewModel (@MainActor ObservableObject)
  Views/                       RootView · LoginView · CoursesView
  SoteriaAssuranceApp.swift    @main + FirebaseApp.configure()
```

Sign-in sets `Auth.auth().tenantID` before authenticating, then reads
`role` / `tenantId` custom claims from the refreshed ID token. All Firestore
reads are rooted at `/tenants/{tenantId}/...` so server-side rules enforce
isolation.
