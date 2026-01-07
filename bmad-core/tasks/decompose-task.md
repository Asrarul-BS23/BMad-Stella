<!-- Powered by Stella Development Team -->

# Decompose Task

## Purpose

To break down a complex task into smaller, manageable subtasks that are easier to understand, implement, and track. This task helps when a single task is too large or involves multiple concerns that should be separated for clarity.

## Task Execution

### 1. Understand the Complex Task

#### 1.1 Analyze the Task Description

- Read the task description provided by the user
- Identify the main objective or goal
- Understand the context (feature, bug fix, migration, etc.)
- Note any constraints or requirements

#### 1.2 Gather Context

Ask the user for additional context if needed:

- What is the technical scope?
- Are there specific files or components involved?
- Are there dependencies or integration points?
- What is the expected outcome?

### 2. Identify Task Components

Break down the complex task into logical components:

#### 2.1 Identify Distinct Concerns

Look for:

- **Setup/Preparation** - Configuration, dependencies, scaffolding
- **Data Layer** - Models, schemas, database changes
- **Business Logic** - Core functionality, algorithms, processing
- **API/Interface** - Endpoints, routes, public interfaces
- **UI/Components** - Frontend elements, views, displays
- **Integration** - Connecting with external systems or services
- **Error Handling** - Validation, error cases, edge cases
- **Testing** - Unit tests, integration tests, test data
- **Documentation** - Code comments, API docs, user docs
- **Cleanup** - Refactoring, optimization, removing old code

#### 2.2 Determine Logical Sequence

Order components by:

- Dependencies (what must come first)
- Complexity (simple to complex, or vice versa if building confidence)
- Risk (high-risk items first for early validation)
- Logical flow (natural progression of work)

### 3. Create Subtask Breakdown

For each identified component, create specific subtasks:

#### 3.1 Subtask Characteristics

Each subtask should be:

- **Atomic** - Focused on one specific thing
- **Clear** - Obvious what needs to be done
- **Completable** - Can be finished in a reasonable time
- **Testable** - Can verify it's done correctly
- **Specific** - Includes file paths, function names, technical details

#### 3.2 Subtask Format

Use checkbox format:

```
- [ ] Parent Task: [High-level description]
  - [ ] Subtask 1: [Specific action with technical detail]
  - [ ] Subtask 2: [Specific action with technical detail]
  - [ ] Subtask 3: [Specific action with technical detail]
```

#### 3.3 Include Technical Details

For each subtask, include:

- **File paths** - Where the work happens
- **Specific actions** - What exactly to do
- **Technical patterns** - How to do it (if non-obvious)
- **Dependencies** - What must be done first
- **Expected outcome** - What success looks like

### 4. Example Decompositions

#### Example 1: Complex Task - "Implement user authentication in .NET API"

**Decomposed:**

```
- [ ] Implement user authentication system
  - [ ] Create User entity in `Models/User.cs` with properties: Id, Email, PasswordHash, CreatedAt
  - [ ] Add ApplicationDbContext in `Data/ApplicationDbContext.cs` with Users DbSet
  - [ ] Create IAuthService interface and AuthService implementation in `Services/AuthService.cs`
  - [ ] Implement password hashing using ASP.NET Core Identity PasswordHasher
  - [ ] Add JWT token generation in `Services/TokenService.cs` using JwtSecurityTokenHandler
  - [ ] Configure JWT authentication in `Program.cs` (AddAuthentication, AddJwtBearer)
  - [ ] Create AuthController in `Controllers/AuthController.cs` with Register and Login endpoints
  - [ ] Add [Authorize] attribute support and configure authorization policies
  - [ ] Create unit tests for AuthService in `Tests/Services/AuthServiceTests.cs`
  - [ ] Create integration tests for auth endpoints in `Tests/Integration/AuthControllerTests.cs`
  - [ ] Update API documentation with authentication flow and JWT usage
```

#### Example 2: Bug Task - "Fix data corruption in CSV export feature"

**Decomposed:**

```
- [ ] Fix data corruption bug in CSV export (PROJ-456)
  - [ ] Reproduce bug with test data in `Tests/TestData/ExportTestData.json`
  - [ ] Add logging in `Services/ExportService.cs` using ILogger to trace data flow
  - [ ] Identify root cause (suspected: encoding issue in CSV generation)
  - [ ] Fix encoding issue in `Utils/CsvGenerator.cs` (use UTF8 with BOM via Encoding.UTF8)
  - [ ] Add input sanitization using StringBuilder.Replace for special characters
  - [ ] Create regression test in `Tests/Integration/ExportServiceTests.cs` with problematic data
  - [ ] Verify fix with original reporter's data set
  - [ ] Update error handling to return ProblemDetails with clear messages if encoding fails
```

### 5. Validate Decomposition

Check that the decomposition is:

- [ ] **Complete** - All aspects of the complex task are covered
- [ ] **Non-overlapping** - Subtasks don't duplicate work
- [ ] **Properly sequenced** - Dependencies are respected
- [ ] **Appropriate granularity** - Not too fine, not too coarse
- [ ] **Actionable** - Junior developer could implement each subtask
- [ ] **Includes testing** - Test tasks are part of the breakdown

### 6. Present Decomposition to User

Provide the decomposed task breakdown with:

- **Original Complex Task:** [Description]
- **Decomposed into:** [N] subtasks
- **Estimated Complexity:** [Simple/Moderate/Complex]
- **Key Components:** [List main areas covered]
- **Suggested Sequence:** [Any important ordering notes]
- **Decomposed Task List:**
  ```
  [Paste the complete task breakdown with checkboxes]
  ```

### 7. Refine if Needed

If user requests changes: adjust granularity (break down further or combine), reorder subtasks, add more technical detail, include additional testing/documentation tasks, or clarify ambiguous subtasks.

## Notes

- This task can be used standalone or as part of the plan-implementation workflow
- Decomposition helps identify hidden complexity early and makes estimation more accurate
- Each subtask should be small enough to complete and verify independently
