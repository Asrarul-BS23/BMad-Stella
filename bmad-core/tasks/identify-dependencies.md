<!-- Powered by Stella Development Team -->

# Identify Dependencies Task

## Purpose

To analyze a JIRA ticket or implementation plan and identify all technical dependencies, potential blockers, integration points, and risks that could impact successful implementation. This task surfaces critical information early, enabling better planning and risk mitigation.

## Documentation Framework

When identifying items in sections 2-5, document the following for each item:

### For Dependencies (Code, Infrastructure, Third-Party, Data):

- **What:** Name/description and what it provides
- **Where:** Location (file path, service URL, package name)
- **State:** Current status (exists, needs creation, needs modification, version)
- **Requirements:** Configuration, access, permissions needed
- **Concerns:** Known issues, limitations, performance considerations, costs

### For Blockers (Technical, Information, Resource):

- **What:** What is blocking or missing
- **Impact:** Severity level (critical, high, medium, low)
- **Resolution:** Who can unblock, how to obtain, estimated time
- **Alternatives:** Workarounds or alternative approaches
- **Partial Progress:** Can work proceed partially?

### For Integration Points (Internal, External):

- **Type:** Connection type and protocol
- **Contract:** Data format, API specification
- **Authentication:** Auth method and credentials management
- **Reliability:** Error handling, retries, rate limits, fallback strategies
- **Testing:** How to test and monitor the integration

### For Risks (Technical, Integration, Project):

- **Description:** Clear description of the risk
- **Assessment:** Likelihood (high/medium/low) and Impact (critical/high/medium/low)
- **Detection:** Early warning signs or detection strategy
- **Mitigation:** Strategy to prevent or reduce risk
- **Contingency:** Fallback plan if risk materializes

## Task Execution

### 1. Understand the Ticket/Plan Context

#### 1.1 Load Ticket or Plan Information

- Read the ticket file, plan file, or description provided
- Extract key information:
  - Ticket type (feature, bug, migration)
  - Technical scope
  - Components involved
  - Integration requirements
  - Timeline constraints (if any)

#### 1.2 Load Architecture Context

First, read the architecture index to understand available documentation:

- Read `architecture/index.md` - Contains brief descriptions of all architecture documents

**Fallback for Architecture Documentation:** If no `architecture/` folder exists inside `bmad-docs/` folder, check for `Claude.md` in the root directory of the project if it exists. This file may contain architecture and project information.

Based on the ticket context and the briefs in the index, decide which architecture files are relevant to explore:

- For technology/package dependencies → Review tech stack documentation
- For project structure/module dependencies → Review structure documentation
- For backend-specific work → Review backend architecture documentation
- For frontend-specific work → Review frontend architecture documentation
- For external integrations → Review external APIs documentation
- For data/schema changes → Review database documentation

**Decision Point:** Only load the architecture files that are relevant to your specific ticket context.

### 2. Identify Technical Dependencies

#### 2.1 Code Dependencies

Identify and document (per framework above):

- **Modules/Components** - Existing code this must interact with
- **Shared Services** - Required utilities or services
- **Data Models** - Required data structures or schemas
- **APIs** - Internal APIs to consume
- **State Management** - Required state or context

#### 2.2 Infrastructure Dependencies

Identify and document (per framework above):

- **Databases** - Database access, schema changes, migrations
- **Caching** - Redis, Memcached, or other caching systems
- **Message Queues** - Kafka, RabbitMQ, or other queuing systems
- **Storage** - File storage, S3, CDN requirements
- **Environment Variables** - New configs or secrets
- **Deployment** - Build pipeline, deployment scripts, infrastructure changes

#### 2.3 Third-Party Dependencies

Identify and document (per framework above):

- **NPM/Package Dependencies** - New libraries or version updates
- **External APIs** - Third-party services to integrate
- **SaaS Services** - Payment gateways, analytics, monitoring
- **Authentication Providers** - OAuth, SAML providers
- **CDNs or Static Resources** - External resource dependencies

Note: Include license compatibility, rate limits, and cost implications in documentation.

#### 2.4 Data Dependencies

Identify and document (per framework above):

- **Existing Data** - Required data availability
- **Data Migrations** - Schema or data migrations required
- **Data Transformations** - Data conversion needs
- **Data Volume** - Amount of data involved
- **Data Quality** - Data quality concerns
- **Data Access** - Permission or privacy requirements

Note: Include migration strategy, validation, backup, and rollback needs in documentation.

### 3. Identify Blockers

#### 3.1 Technical Blockers

Identify and document (per framework above) anything that could prevent implementation:

- **Missing Infrastructure** - Required services not yet provisioned
- **Incomplete Features** - Depends on other unfinished work
- **Technical Debt** - Existing code that must be refactored first
- **Performance Issues** - Current system can't handle new requirements
- **Security Gaps** - Security requirements not yet met
- **Technical Limitations** - Platform or technology constraints

#### 3.2 Information Blockers

Identify and document (per framework above) missing information:

- **Unclear Requirements** - Specifications not fully defined
- **Ambiguous Acceptance Criteria** - Success conditions unclear
- **Missing Designs** - UI/UX designs not available
- **Unknown Integration Details** - Third-party API specs unclear
- **Undecided Architecture** - Technical approach not yet determined

#### 3.3 Resource Blockers

Identify and document (per framework above) resource constraints:

- **Access/Permissions** - Lack of access to systems, repos, or services
- **Budget Constraints** - Costs exceeding budget
- **Time Constraints** - Dependencies won't be ready in time
- **Skill Gaps** - Specialized knowledge required
- **Tooling** - Required tools not available

### 4. Identify Integration Points

#### 4.1 Internal Integration Points

Identify and document (per framework above) connections within the system:

- **Frontend-Backend** - API calls, data flows
- **Service-to-Service** - Microservice communications
- **Database Connections** - Data access patterns
- **Event Systems** - Event producers and consumers
- **Shared State** - Global state or cache dependencies

#### 4.2 External Integration Points

Identify and document (per framework above) connections to external systems:

- **Third-Party APIs** - External service calls
- **Webhooks** - Incoming or outgoing webhook integrations
- **File Imports/Exports** - Data exchange with external systems
- **Authentication** - SSO, OAuth providers
- **Monitoring/Logging** - External monitoring services

### 5. Assess Risks

#### 5.1 Technical Risks

Identify and document (per framework above):

- **Complexity** - Solution is technically complex
- **New Technology** - Using unfamiliar tech stack
- **Performance** - May not meet performance requirements
- **Scalability** - Solution may not scale
- **Security** - Potential security vulnerabilities
- **Data Loss** - Risk of data corruption or loss (especially migrations)
- **Browser/Platform Compatibility** - May not work across targets

#### 5.2 Integration Risks

Identify and document (per framework above):

- **API Changes** - Third-party APIs may change
- **Service Downtime** - External services may be unavailable
- **Version Incompatibility** - Dependency version conflicts
- **Data Format Changes** - External data formats may change
- **Rate Limiting** - May hit rate limits under load

#### 5.3 Project Risks

Identify and document (per framework above):

- **Scope Creep** - Requirements may expand
- **Timeline Pressure** - Tight deadlines may force shortcuts
- **Dependency Delays** - Other teams may delay
- **Resource Availability** - Key resources may be unavailable
- **Requirement Changes** - Requirements may change during implementation

### 6. Recommend Mitigation Strategies

For identified dependencies and risks, provide strategies:

#### 6.1 Dependency Management

- **Early Validation** - Verify dependencies before main implementation
- **Parallel Workstreams** - Work on independent parts while waiting
- **Stub/Mock** - Create mocks for unavailable dependencies
- **Incremental Approach** - Deliver in phases to reduce risk
- **Fallback Options** - Identify alternative approaches

#### 6.2 Risk Mitigation

- **Proof of Concept** - Validate high-risk approaches early
- **Feature Flags** - Use flags to enable/disable safely
- **Gradual Rollout** - Deploy incrementally to subset of users
- **Monitoring** - Add comprehensive monitoring and alerting
- **Rollback Plan** - Have clear rollback procedures
- **Testing** - Extra testing for high-risk areas

### 7. Create Temporary Dependency File

Create a temporary file to store the dependency analysis:

#### 7.1 File Creation

- **File name:** `{{ticket_no}}-dependency-tmp.md`
- **Location:** `bmad-docs/temporary/`
- **Purpose:** Store dependencies for use by create-implementation-plan task

**Note:** If the `bmad-docs/temporary` folder doesn't exist, create it first.

#### 7.2 File Content Structure

Write the comprehensive dependency analysis to the temporary file using the following structure:

```markdown
# Dependency Analysis Report: [Ticket Number] - [Title]

## Summary

- Total Dependencies Identified: [N]
- Critical Blockers: [N]
- High-Risk Items: [N]
- External Integrations: [N]
- Overall Risk Level: [Low/Medium/High/Critical]

## Technical Dependencies

[List with details]

## Infrastructure Dependencies

[List with details]

## Third-Party Dependencies

[List with details]

## Data Dependencies

[List with details]

## Blockers

[List with severity, impact, mitigation]

## Integration Points

[List with protocols, error handling]

## Risks

[List with likelihood, impact, mitigation]

## Recommended Approach

1. [First priority action]
2. [Second priority action]
3. [Continue with remaining actions]

## Critical Path Items

- [Items that must be resolved before starting]
- [Items that must be resolved during implementation]

## Next Steps

1. Resolve critical blockers
2. Validate high-risk dependencies
3. Proceed with implementation plan
```

#### 7.3 Present Summary to User

After creating the file, provide a summary to the user:

- Location of the temporary file
- Total dependencies identified
- Critical blockers that need attention
- Overall risk level assessment

### 8. Integration with Implementation Plan

The `create-implementation-plan` task will read `{{ticket_no}}-dependency-tmp.md` and integrate dependencies into the implementation plan's "Dependencies and Risks" section, "Technical Approach", and "Tasks / Subtasks".

#### 8.1 Cleanup Logic

After integration, the create-implementation-plan task performs cleanup:

**All dependencies addressed:** Delete `{{ticket_no}}-dependency-tmp.md` completely.

**Dependencies span multiple subtasks:** Remove only addressed dependencies from the temporary file. Keep remaining dependencies for subsequent decomposed subtasks that will reuse the file.

#### 8.2 Workflow

1. **Identify Dependencies** → Creates `{{ticket_no}}-dependency-tmp.md`
2. **Decompose Task** (if needed) → Breaks large tasks into smaller subtasks
3. **Create Implementation Plan** → Integrates dependencies, cleans up file as appropriate
4. **Repeat** → Subsequent subtasks reuse temporary file until all dependencies addressed

## Notes

- This task is typically run as part of create-implementation-plan workflow
- Can also be run standalone for existing plans or tickets
- Creates a temporary file `{{ticket_no}}-dependency-tmp.md` in `bmad-docs/temporary/` for use by subsequent tasks
- Temporary file persists across decomposed subtasks and is cleaned up once all dependencies are addressed
- Supports BMAD decomposition workflow where large tasks (multiple story points) are broken into smaller tasks (max 1 story point each)
- Dependency identification helps set realistic timelines
- Early identification prevents surprises during implementation
- Risk mitigation strategies should be concrete and actionable
- Document assumptions clearly when dependencies are uncertain
