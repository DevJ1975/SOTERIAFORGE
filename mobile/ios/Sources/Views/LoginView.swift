import SwiftUI

struct LoginView: View {
    @StateObject var viewModel: LoginViewModel

    var body: some View {
        Form {
            Section {
                TextField("Organization (tenant) id", text: $viewModel.tenantId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                Text("Leave blank only for platform admins")
            }

            Section {
                TextField("Email", text: $viewModel.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $viewModel.password)
            }

            if let error = viewModel.error {
                Text(error).foregroundStyle(.red)
            }

            Section {
                Button(action: viewModel.submit) {
                    if viewModel.loading {
                        ProgressView()
                    } else {
                        Text("Sign in")
                    }
                }
                .disabled(viewModel.loading)
            }
        }
    }
}
