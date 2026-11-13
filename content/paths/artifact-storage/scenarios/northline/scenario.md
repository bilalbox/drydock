Northline ships a game build every night. Last month someone published a bucket to the internet, and the week before that a bad build overwrote the only copy of a release candidate.

They want one bucket, named `northline-artifacts`, in the local account this lab already points at `us-east-1`. Every object must be versioned so a bad build can be restored. Public access must be blocked: no public ACLs, no public policies, and public ACLs that already exist must be ignored.

The provider file in the workspace is already wired to the local emulator. Write the bucket in `main.tf`. Leave `provider.tf` alone. The inspector can show the bucket after apply. It cannot create one.
