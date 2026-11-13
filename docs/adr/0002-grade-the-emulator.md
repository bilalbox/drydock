# Grade the emulator, not Terraform state

A check passes only when the emulated cloud API reports the required resources. Terraform state was the obvious thing to diff, and it is easy to fake: a learner can edit `terraform.tfstate` or apply against a different endpoint and still present a clean plan. The emulator is the system the lab claims to teach. Checks therefore run the cloud CLIs against that emulator, with the check working directory kept outside the workspace so the workspace cannot replace them. State remains useful to the learner for plan and apply. It is not evidence.
