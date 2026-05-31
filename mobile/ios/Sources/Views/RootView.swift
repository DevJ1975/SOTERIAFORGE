import SwiftUI

/// Top-level state machine: unauthenticated -> Login, authenticated -> Courses.
struct RootView: View {
    @State private var principal: Principal?

    var body: some View {
        NavigationStack {
            if let principal {
                CoursesView(viewModel: CoursesViewModel(principal: principal))
                    .navigationTitle("My courses")
            } else {
                LoginView(viewModel: LoginViewModel(onSignedIn: { self.principal = $0 }))
                    .navigationTitle("Sign in")
            }
        }
    }
}
