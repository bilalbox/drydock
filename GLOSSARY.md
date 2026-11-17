# Drydock

A local lab for learning infrastructure as code. The learner writes Terraform against emulated clouds and sees the result in a read-only inspector.

## Language

**Path**:
An ordered set of scenarios that teach one theme.
_Avoid_: Course, track, learning plan

**Scenario**:
A customer problem the learner is asked to solve.
_Avoid_: Assignment, story, module

**Lab**:
One hands-on unit inside a scenario. The mode is guided, challenge, or issue.
_Avoid_: Exercise, lesson, click-through

**Guided lab**:
A lab that teaches how a mechanism works by naming the resources and settings and walking the learner through writing them.
_Avoid_: Tutorial, walkthrough, lesson

**Challenge**:
A lab that states the required end state and withholds the way to get there.
_Avoid_: DIY, exam, boss fight

**Issue**:
A lab that starts from a wrong system and describes the customer's symptoms the way a support ticket would. The ticket is the only explanation: the required outcome is the corrected system, and the cause stays unnamed.
_Avoid_: Incident, debug lab, bug bash

**Fault**:
The one thing wrong in an issue: Terraform that cannot be applied, or drift the workspace does not already repair.
_Avoid_: Bug, root cause

**Drift**:
A difference between the session's resources and its Terraform, caused by a change made outside Terraform.
_Avoid_: Production drift, click-ops

**Reference**:
A vendor page linked from a guided lab so the learner can read the vendor's own account of a behavior.
_Avoid_: Hint, solution, cheat sheet

**Session**:
The one running lab on this machine: its clouds, workspace, and terminal.
_Avoid_: Attempt, run, environment

**Workspace**:
The files for the current session, including the learner's Terraform and the generated provider wiring.
_Avoid_: Repo, project, home directory

**Provider bundle**:
The generated files and environment that point Terraform and a cloud CLI at the local emulator.
_Avoid_: Provider config, credentials, endpoint file

**Check**:
A predicate over the emulator's API. A check does not read Terraform state.
_Avoid_: Test, assertion, grader rule

**Attempt**:
One press of Check, and the result of every check in the lab.
_Avoid_: Submission, run, grade

**Inspector**:
The read-only view of resources the emulator currently holds.
_Avoid_: Console, clickops, management UI

**Visual**:
The diagram of resources in the session's Terraform state, or of the changes a fresh plan would make.
_Avoid_: Architecture map, graph view

**Cloud**:
One of aws, azure, gcp, or oci. A lab names the clouds it needs.
_Avoid_: Provider, account, subscription

**Emulator**:
A local server that stands in for a cloud API during a session.
_Avoid_: Simulator, mock cloud, fake backend

**Toolbox**:
The execution environment that runs Terraform and cloud CLIs against the session's workspace and clouds.
_Avoid_: Runner, sandbox, shell container
