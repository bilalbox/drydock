# Drydock

A local, Compose-run lab for infrastructure as code. One learner, one machine. Terraform and the AWS, Azure, gcloud, and OCI CLIs run in a toolbox container against [Floci](https://floci.io/) emulators. The course UI is the only published port. The inspector is Floci UI with creates and deletes stripped out.

## GitHub Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/OWNER/REPO?quickstart=1)

Replace `OWNER/REPO` with the published repository, for example `octo-org/drydock`.

The badge is a [codespace deep link](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/setting-up-your-repository/facilitating-quick-creation-and-resumption-of-codespaces). `quickstart=1` resumes the newest codespace for the default branch, or creates one, and opens it in the VS Code web client. For another branch, use `https://codespaces.new/OWNER/REPO/tree/BRANCH-NAME`. To pin this dev container on that page, add `devcontainer_path=.devcontainer/devcontainer.json`.

The deep link does not set the machine size. [`hostRequirements`](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/configuring-dev-containers/setting-a-minimum-specification-for-codespace-machines) in `.devcontainer/devcontainer.json` does. It requires 4 CPUs, 16 GB of memory, and 32 GB of storage. Codespaces then offers only machines at or above that floor, and starts the smallest of them unless you pick a larger one on the options page. That default is 4 cores, 16 GB RAM, and 32 GB storage (`standardLinux32gb`). The 2-core, 8 GB machine is left out so the toolbox build and a running emulator have room. An options-page URL such as `https://github.com/codespaces/new?repo=REPOSITORY_ID&machine=standardLinux32gb` can pre-select a machine, but `REPOSITORY_ID` is numeric and the page still lets you change the selection, so the badge does not use it.

The dev container is Debian with Docker inside it. Compose publishes port 8080 on that container, and Codespaces forwards the port. Each start runs `.devcontainer/up.sh`, which waits for the daemon and then runs `docker compose up --build -d`. The first start builds the toolbox and pulls the Floci images. The postStartCommand terminal shows that progress.

When port 8080 is listening, Codespaces forwards it and opens the course UI once. In the Ports tab the row is named Drydock. The address is `https://<codespace-name>-8080.app.github.dev`. In the VS Code desktop app the same UI is also at http://127.0.0.1:8080. Start the sample lab from that page.

A 4-core machine uses four of the included core-hours per hour. GitHub Free includes 120 core-hours a month. Stop the codespace at https://github.com/codespaces when you finish. To stop the containers and leave the codespace open:

```sh
docker compose --profile on-demand down
```

## Run

From the repository root. The Docker user needs permission to use the Docker socket.

```sh
docker compose up --build
docker compose --profile on-demand down
```

Open http://127.0.0.1:8080. Start the sample lab, edit `main.tf` in the Editor tab, `terraform apply` in the Terminal, then press Check. The editor saves into the lab workspace, which is the directory the terminal uses.

`docker compose down` on its own leaves emulators running, and the network then stays up because those containers are still attached. `--profile on-demand` includes them. Compose has no `--destroy` flag. To remove the containers, the images this project built, and the lab data under `./data`:

```sh
docker compose --profile on-demand down --volumes --rmi local --remove-orphans
mkdir -p data/workspaces data/floci-az
find data/workspaces data/floci-az -mindepth 1 -delete
rm -f data/progress.json
```

`--rmi local` leaves the pulled Floci images in place. `--volumes` does not delete `./data`, because those directories are bind mounts, so the `find` removes the workspaces, progress, and the Azure CA files.

Emulators stay stopped until a lab names them. Only one lab session is active. Starting a lab replaces the previous one and wipes that cloud.

## Sample lab

`artifact-storage` / Northline has three labs. The guided lab asks for an S3 bucket named `northline-artifacts`, with versioning enabled and public access blocked, and links the AWS pages that say why. The challenge asks for noncurrent versions to expire after 30 days and for incomplete multipart uploads to abort after 7 days, and withholds the way there. The issue opens on that bucket after a console change and a support ticket. A guided lab names the resources. A challenge states the outcome. An issue describes symptoms and leaves the cause unnamed. The solutions used by the acceptance test live under each lab's `solution/` directory. They are not copied into the workspace. The issue also has a `seed.yaml` that is applied before the learner arrives, and is not copied either.

```sh
./scripts/accept.sh
```

That builds the stack, applies the solution inside the toolbox, and requires every check to pass.

## Other clouds

Azure, GCP, and OCI provider bundles are generated and covered by unit tests. They are not part of the automated apply. Before writing a lab for one of them, smoke it by hand:

- Azure: `FLOCI_AZ_TLS_ENABLED` is on. Session start runs `drydock-prepare-azure`, which downloads `http://floci-az:4577/_floci/tls-cert` into the workspace trust bundle and registers an `az` cloud named `drydock`. `azurerm` uses `metadata_host = "floci-az:4577"` and does not set `environment`, because provider 4.81 ignores that field when the metadata host is set. A TLS error on plan means the CA file was not written before init.
- GCP: Terraform custom endpoints follow the floci-gcp compatibility suite (`/storage/v1/`, `/v1/`, and `http://container.floci-gcp:4588/` for GKE). `GOOGLE_OAUTH_ACCESS_TOKEN=fake-token`. gcloud uses `CLOUDSDK_API_ENDPOINT_OVERRIDES_*`. Container calls from gcloud use the `/container/` prefix, not the host-mode URL.
- OCI: the provider reads `CLIENT_HOST_OVERRIDES` (not `TF_VAR_CLIENT_HOST_OVERRIDES`). The dummy key is `/opt/drydock/oci-dummy.pem`. Confirm a bucket apply reaches `http://floci-oci:4599` before trusting a new client name in that list.

## Layout

- `.devcontainer/` — Codespaces machine floor, Docker, and the start command
- `content/` — paths, scenarios, labs, checks, and the hidden solution
- `services/labd` — catalog, sessions, emulator lifecycle, grader, terminal
- `services/toolbox` — Terraform, provider mirror, and the four CLIs
- `services/inspector-gate` — read-only proxy in front of Floci UI
- `services/web` — course shell
