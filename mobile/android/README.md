# Soteria Assurance — Android

Native Android client (Kotlin · Jetpack Compose · Firebase).

## Prerequisites

- Android Studio (Ladybug or newer) / JDK 17
- A Firebase project with **Identity Platform multi-tenancy** enabled and
  Email/Password sign-in on.

## Setup

1. In the Firebase console, register an Android app with package
   `com.soteria.assurance` and download `google-services.json`.
2. Place it at `app/google-services.json` (it is gitignored — never commit it).
   See `app/google-services.json.example` for the shape.
3. Open the `android/` folder in Android Studio and let Gradle sync.

> A Gradle wrapper `gradle-wrapper.properties` is included; on first run the
> wrapper jar is fetched automatically by Android Studio. From the CLI you can
> alternatively run `gradle wrapper` once to materialize `gradlew`.

## Run

```bash
./gradlew :app:assembleDebug      # build the debug APK
./gradlew :app:installDebug       # install on a connected device/emulator
```

## Architecture

```
data/
  model/      Course · Module · Enrollment · Principal  (mirror libs/shared)
  auth/       AuthRepository   — GCIP tenant sign-in + ID-token claims
  course/     CourseRepository — tenant-scoped Firestore reads
ui/
  login/      LoginViewModel + LoginScreen
  courses/    CoursesViewModel + CoursesScreen
  theme/      MaterialTheme color scheme
MainActivity  top-level login → courses state machine
```

Sign-in sets the GCIP tenant id on `FirebaseAuth` before authenticating, then
reads `role` / `tenantId` custom claims from the refreshed ID token. All
Firestore reads are rooted at `/tenants/{tenantId}/...` so server-side rules
enforce isolation.
