| Function Code    | SaveChartVersion                                                                                                  | Function Name      | createHistorySnapshot |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------- |
| Created By       | AnNVD                                                                                                             | Executed By        | AnNVD                 |
| Lines of code    | 32                                                                                                                | Lack of test cases | 1.6                   |
| Test requirement | Verify that the system allows authenticated users to save a chart version, handling all error and boundary cases. |

| Passed | Failed | Untested | N/A/B | Total Test Cases |
| ------ | ------ | -------- | ----- | ---------------- |
| 6      | 0      | 0        | 1     | 3 3 0 6          |

|                                                   | UTCID01                                 | UTCID02 | UTCID03 | UTCID04 | UTCID05 | UTCID06 |
| ------------------------------------------------- | --------------------------------------- | ------- | ------- | ------- | ------- | ------- | --- |
| Condition                                         | Precondition                            |         |         |         |         |         |
|                                                   | User logged in                          | O       | O       | O       | O       | O       | O   |
|                                                   | Internet connection stable              | O       | O       | O       | O       | O       | O   |
|                                                   | Chart exists                            | O       |         |         |         |         |     |
|                                                   | Chart not found                         |         | O       |         |         |         |     |
|                                                   | Chart owned by another user             |         |         | O       |         |         |     |
| ChartId                                           | ValidId                                 | O       |         |         |         |         |     |
|                                                   | InvalidId                               |         | O       |         |         |         |     |
|                                                   | Chart owned by another user             |         |         | O       |         |         |     |
| Confirm Return                                    | StatusCode: 200                         | O       |         |         |         |         |     |
|                                                   | StatusCode: 404                         |         | O       |         |         |         |     |
|                                                   | StatusCode: 403                         |         |         | O       |         |         |     |
| Exception                                         | CHART_NOT_FOUND                         |         | O       |         |         |         |     |
|                                                   | UNAUTHORIZED_ACCESS                     |         |         | O       |         |         |     |
| Log Message                                       | “History snapshot created successfully” | O       |         |         |         |         |     |
|                                                   | “Chart not found”                       |         | O       |         |         |         |     |
|                                                   | “You do not have access to this chart”  |         |         | O       |         |         |     |
| Result Type (N: Normal, A: Abnormal, B: Boundary) | N                                       | A       | A       | B       | B       | B       |
| Passed/Failed                                     | P                                       | P       | P       | P       | P       | P       |
| Executed Date                                     | 30/11                                   | 30/11   | 30/11   | 30/11   | 30/11   | 30/11   |
| Defect ID                                         |                                         |         |         |         |         |         |

---

| Function Code    | ViewChartVersion                                                                                                          | Function Name      | getChartHistory |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
| Created By       | AnNVD                                                                                                                     | Executed By        | AnNVD           |
| Lines of code    | 27                                                                                                                        | Lack of test cases | 1.5             |
| Test requirement | Verify that the system allows authenticated users to view all versions of a chart, handling all error and boundary cases. |

| Passed | Failed | Untested | N/A/B | Total Test Cases |
| ------ | ------ | -------- | ----- | ---------------- |
| 6      | 0      | 0        | 1     | 3 3 0 6          |

|                                                   | UTCID01                                | UTCID02 | UTCID03 | UTCID04 | UTCID05 | UTCID06 |
| ------------------------------------------------- | -------------------------------------- | ------- | ------- | ------- | ------- | ------- | --- |
| Condition                                         | Precondition                           |         |         |         |         |         |
|                                                   | User logged in                         | O       | O       | O       | O       | O       | O   |
|                                                   | Internet connection stable             | O       | O       | O       | O       | O       | O   |
|                                                   | Chart exists                           | O       |         |         |         |         |     |
|                                                   | Chart not found                        |         | O       |         |         |         |     |
|                                                   | Chart owned by another user            |         |         | O       |         |         |     |
| ChartId                                           | ValidId                                | O       |         |         |         |         |     |
|                                                   | InvalidId                              |         | O       |         |         |         |     |
|                                                   | Chart owned by another user            |         |         | O       |         |         |     |
| Confirm Return                                    | StatusCode: 200                        | O       |         |         |         |         |     |
|                                                   | StatusCode: 404                        |         | O       |         |         |         |     |
|                                                   | StatusCode: 403                        |         |         | O       |         |         |     |
| Exception                                         | CHART_NOT_FOUND                        |         | O       |         |         |         |     |
|                                                   | UNAUTHORIZED_ACCESS                    |         |         | O       |         |         |     |
| Log Message                                       | “Chart history fetched successfully”   | O       |         |         |         |         |     |
|                                                   | “Chart not found”                      |         | O       |         |         |         |     |
|                                                   | “You do not have access to this chart” |         |         | O       |         |         |     |
| Result Type (N: Normal, A: Abnormal, B: Boundary) | N                                      | A       | A       | B       | B       | B       |
| Passed/Failed                                     | P                                      | P       | P       | P       | P       | P       |
| Executed Date                                     | 30/11                                  | 30/11   | 30/11   | 30/11   | 30/11   | 30/11   |
| Defect ID                                         |                                        |         |         |         |         |         |

---

| Function Code    | CompareChartVersion                                                                                                                    | Function Name      | getHistoryById |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| Created By       | AnNVD                                                                                                                                  | Executed By        | AnNVD          |
| Lines of code    | 24                                                                                                                                     | Lack of test cases | 1.3            |
| Test requirement | Verify that the system allows authenticated users to view and compare a specific chart version, handling all error and boundary cases. |

| Passed | Failed | Untested | N/A/B | Total Test Cases |
| ------ | ------ | -------- | ----- | ---------------- |
| 6      | 0      | 0        | 1     | 3 3 0 6          |

|                                                   | UTCID01                                         | UTCID02 | UTCID03 | UTCID04 | UTCID05 | UTCID06 |
| ------------------------------------------------- | ----------------------------------------------- | ------- | ------- | ------- | ------- | ------- | --- |
| Condition                                         | Precondition                                    |         |         |         |         |         |
|                                                   | User logged in                                  | O       | O       | O       | O       | O       | O   |
|                                                   | Internet connection stable                      | O       | O       | O       | O       | O       | O   |
|                                                   | History record exists                           | O       |         |         |         |         |     |
|                                                   | History record not found                        |         | O       |         |         |         |     |
|                                                   | History record owned by another user            |         |         | O       |         |         |     |
| HistoryId                                         | ValidId                                         | O       |         |         |         |         |     |
|                                                   | InvalidId                                       |         | O       |         |         |         |     |
|                                                   | History owned by another user                   |         |         | O       |         |         |     |
| Confirm Return                                    | StatusCode: 200                                 | O       |         |         |         |         |     |
|                                                   | StatusCode: 404                                 |         | O       |         |         |         |     |
|                                                   | StatusCode: 403                                 |         |         | O       |         |         |     |
| Exception                                         | HISTORY_NOT_FOUND                               |         | O       |         |         |         |     |
|                                                   | UNAUTHORIZED_ACCESS                             |         |         | O       |         |         |     |
| Log Message                                       | “History record fetched successfully”           | O       |         |         |         |         |     |
|                                                   | “History record not found”                      |         | O       |         |         |         |     |
|                                                   | “You do not have access to this history record” |         |         | O       |         |         |     |
| Result Type (N: Normal, A: Abnormal, B: Boundary) | N                                               | A       | A       | B       | B       | B       |
| Passed/Failed                                     | P                                               | P       | P       | P       | P       | P       |
| Executed Date                                     | 30/11                                           | 30/11   | 30/11   | 30/11   | 30/11   | 30/11   |
| Defect ID                                         |                                                 |         |         |         |         |         |

---
