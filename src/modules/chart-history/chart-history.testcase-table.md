| Condition                                  | UTCID01 (Normal) | UTCID02 (Chart not found) | UTCID03 (Not owner) | UTCID04 (Empty name) | UTCID05 (Duplicate name) | UTCID06 (Invalid config) |
| ------------------------------------------ | ---------------- | ------------------------- | ------------------- | -------------------- | ------------------------ | ------------------------ |
| Precondition                               |                  |                           |                     |                      |                          |                          |
| User logged in                             | O                | O                         | O                   | O                    | O                        | O                        |
| Chart exists                               | O                |                           | O                   | O                    | O                        | O                        |
| Chart not found                            |                  | O                         |                     |                      |                          |                          |
| Chart owned by user                        | O                | O                         |                     | O                    | O                        | O                        |
| Chart owned by another user                |                  |                           | O                   |                      |                          |                          |
| Internet connection stable                 | O                | O                         | O                   | O                    | O                        | O                        |
| Chart ID                                   |                  |                           |                     |                      |                          |                          |
| Valid, exists in DB                        | O                |                           | O                   | O                    | O                        | O                        |
| Non-existent                               |                  | O                         |                     |                      |                          |                          |
| Duplicate name                             |                  |                           |                     |                      | O                        |                          |
| Invalid config                             |                  |                           |                     |                      |                          | O                        |
| Confirm (Expected Result)                  |                  |                           |                     |                      |                          |                          |
| StatusCode: 200                            | O                |                           |                     |                      |                          |                          |
| StatusCode: 400                            |                  | O                         | O                   | O                    | O                        | O                        |
| StatusCode: 403                            |                  |                           | O                   |                      |                          |                          |
| StatusCode: 500                            |                  |                           |                     |                      |                          |                          |
| Exception                                  |                  |                           |                     |                      |                          |                          |
| CHART_HISTORY_CREATE_SUCCESS               | O                |                           |                     |                      |                          |                          |
| CHART_NOT_FOUND                            |                  | O                         |                     |                      |                          |                          |
| UNAUTHORIZED_ACCESS                        |                  |                           | O                   |                      |                          |                          |
| INVALID_CHART_CONFIG                       |                  |                           |                     |                      |                          | O                        |
| CHART_NAME_DUPLICATE                       |                  |                           |                     |                      | O                        |                          |
| MISSING_REQUIRED_FIELD                     |                  |                           |                     | O                    |                          |                          |
| SERVER_ERROR                               |                  |                           |                     |                      |                          |                          |
| Log Message                                |                  |                           |                     |                      |                          |                          |
| "Chart history created successfully"       | O                |                           |                     |                      |                          |                          |
| "Chart not found"                          |                  | O                         |                     |                      |                          |                          |
| "You do not have access to this chart"     |                  |                           | O                   |                      |                          |                          |
| "Invalid chart config"                     |                  |                           |                     |                      |                          | O                        |
| "Chart name already exists"                |                  |                           |                     |                      | O                        |                          |
| "Missing required information"             |                  |                           |                     | O                    |                          |                          |
| "Server error occurred"                    |                  |                           |                     |                      |                          |                          |
| Type (N: Normal, A: Abnormal, B: Boundary) | N                | A                         | A                   | B                    | B                        | B                        |
| Passed/Failed                              | P                | P                         | P                   | P                    | P                        | P                        |
| Executed Date                              | 30/11            | 30/11                     | 30/11               | 30/11                | 30/11                    | 30/11                    |
| Defect ID                                  |                  |                           |                     |                      |                          |                          |

---

| Condition                                  | UTCID01 (Normal) | UTCID02 (Chart not found) | UTCID03 (Not owner) |
| ------------------------------------------ | ---------------- | ------------------------- | ------------------- |
| Precondition                               |                  |                           |                     |
| User logged in                             | O                | O                         | O                   |
| Chart exists                               | O                |                           | O                   |
| Chart not found                            |                  | O                         |                     |
| Chart owned by user                        | O                | O                         |                     |
| Chart owned by another user                |                  |                           | O                   |
| Internet connection stable                 | O                | O                         | O                   |
| Chart ID                                   |                  |                           |                     |
| Valid, exists in DB                        | O                |                           | O                   |
| Non-existent                               |                  | O                         |                     |
| Confirm (Expected Result)                  |                  |                           |                     |
| StatusCode: 200                            | O                |                           |                     |
| StatusCode: 400                            |                  | O                         | O                   |
| StatusCode: 403                            |                  |                           | O                   |
| StatusCode: 500                            |                  |                           |                     |
| Exception                                  |                  |                           |                     |
| CHART_HISTORY_VIEW_SUCCESS                 | O                |                           |                     |
| CHART_NOT_FOUND                            |                  | O                         |                     |
| UNAUTHORIZED_ACCESS                        |                  |                           | O                   |
| SERVER_ERROR                               |                  |                           |                     |
| Log Message                                |                  |                           |                     |
| "Chart history fetched successfully"       | O                |                           |                     |
| "Chart not found"                          |                  | O                         |                     |
| "You do not have access to this chart"     |                  |                           | O                   |
| "Server error occurred"                    |                  |                           |                     |
| Type (N: Normal, A: Abnormal, B: Boundary) | N                | A                         | A                   |
| Passed/Failed                              | P                | P                         | P                   |
| Executed Date                              | 30/11            | 30/11                     | 30/11               |
| Defect ID                                  |                  |                           |                     |

---

| Condition                                       | UTCID01 (Normal) | UTCID02 (History not found) | UTCID03 (Not owner) |
| ----------------------------------------------- | ---------------- | --------------------------- | ------------------- |
| Precondition                                    |                  |                             |                     |
| User logged in                                  | O                | O                           | O                   |
| History exists                                  | O                |                             | O                   |
| History not found                               |                  | O                           |                     |
| History owned by user                           | O                | O                           |                     |
| History owned by another user                   |                  |                             | O                   |
| Internet connection stable                      | O                | O                           | O                   |
| History ID                                      |                  |                             |                     |
| Valid, exists in DB                             | O                |                             | O                   |
| Non-existent                                    |                  | O                           |                     |
| Confirm (Expected Result)                       |                  |                             |                     |
| StatusCode: 200                                 | O                |                             |                     |
| StatusCode: 400                                 |                  | O                           | O                   |
| StatusCode: 403                                 |                  |                             | O                   |
| StatusCode: 500                                 |                  |                             |                     |
| Exception                                       |                  |                             |                     |
| CHART_HISTORY_COMPARE_SUCCESS                   | O                |                             |                     |
| HISTORY_NOT_FOUND                               |                  | O                           |                     |
| UNAUTHORIZED_ACCESS                             |                  |                             | O                   |
| SERVER_ERROR                                    |                  |                             |                     |
| Log Message                                     |                  |                             |                     |
| "History record fetched successfully"           | O                |                             |                     |
| "History record not found"                      |                  | O                           |                     |
| "You do not have access to this history record" |                  |                             | O                   |
| "Server error occurred"                         |                  |                             |                     |
| Type (N: Normal, A: Abnormal, B: Boundary)      | N                | A                           | A                   |
| Passed/Failed                                   | P                | P                           | P                   |
| Executed Date                                   | 30/11            | 30/11                       | 30/11               |
| Defect ID                                       |                  |                             |                     |
