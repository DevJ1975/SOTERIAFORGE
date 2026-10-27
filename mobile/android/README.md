# Soteria Assurance — Android

Native Android client (Kotlin · Jetpack Compose) for the Forge API.

## Prerequisites

- Android Studio (Ladybug or newer) / JDK 17
- A reachable Forge API (Django on Railway, or `http://10.0.2.2:8000` for a local
  backend from the emulator) and a member account on it.

## Setup

1. Optional: point the app at another API with
   `./gradlew :app:assembleDebug -PforgeApiBaseUrl=http://10.0.2.2:8000`
   (default `https://api.soteriaforge.com`).
2. Open the `android/` folder in Android Studio and let Gradle sync.

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
  model/      Course · Module · Lesson · Principal  (Forge API wire shapes)
  net/        ForgeApi · Session — JSON over HttpURLConnection, in-memory tokens
  auth/       AuthRepository   — POST /api/auth/login, GET /api/me
  course/     CourseRepository — GET /api/courses, GET /api/courses/{id}
ui/
  login/      LoginViewModel + LoginScreen
  courses/    CoursesViewModel + CoursesScreen
  theme/      MaterialTheme color scheme
MainActivity  top-level login → courses state machine
```

Sign-in posts the organization (tenant) id, email and password to `/api/auth/login`
(`client: "mobile"`, so the refresh token comes back in the body), then reads the
member's role and tenant from `/api/me`. Every request carries the access token and
`X-Forge-Tenant`; the API scopes data to the tenant with Postgres row-level security.
A 401 triggers one refresh via `/api/auth/refresh`. Tokens live in memory only.
