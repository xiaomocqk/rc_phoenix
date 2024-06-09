(async function () {
    'use strict';

    var matches = window.location.pathname.match(/^\/projects\/([^?&/]+)/)
    var projectId = matches ? matches[1] : ""
    var testCaseId = null;
    var tampermonkeyTd = "$$_tampermonkeyTd"
    var SERVICE_HOST = 'http://localhost:3000'

    var json = await fetchGraphqlData(projectId)
    var traces = json.data.project.rootSpans.edges
    console.log(traces)

    var $table = await waitForTableTracesExisting(10)
    var $tbody = $table.querySelector('tbody')
    var $curTbodyTd = null
    let dialogLabels = null
    appendColumn2thead('labels')
    appendColumn2tbody(traces)

    function fetchGraphqlData(projectId) {
        var headers = new Headers();
        headers.append("Content-Type", "application/json");
        var graphql = JSON.stringify({
            query: "query ProjectPageQuery( $id: GlobalID!  $timeRange: TimeRange!) {  project: node(id: $id) {    __typename    ...SpansTable_spans    ...TracesTable_spans    ...ProjectPageHeader_stats    ...StreamToggle_data    __isNode: __typename    id  }}fragment ProjectPageHeader_stats on Project {  traceCount(timeRange: $timeRange)  tokenCountTotal(timeRange: $timeRange)  latencyMsP50: latencyMsQuantile(probability: 0.5, timeRange: $timeRange)  latencyMsP99: latencyMsQuantile(probability: 0.99, timeRange: $timeRange)  spanEvaluationNames  documentEvaluationNames  id}fragment SpanColumnSelector_evaluations on Project {  spanEvaluationNames}fragment SpansTable_spans on Project {  ...SpanColumnSelector_evaluations  spans(first: 100, sort: {col: startTime, dir: desc}, timeRange: $timeRange) {    edges {      span: node {        spanKind        name        metadata        statusCode        startTime        latencyMs        tokenCountTotal        tokenCountPrompt        tokenCountCompletion        context {          spanId          traceId        }        input {          value: truncatedValue        }        output {          value: truncatedValue        }        spanEvaluations {          name          label          score        }        documentRetrievalMetrics {          evaluationName          ndcg          precision          hit        }      }      cursor      node {        __typename      }    }    pageInfo {      endCursor      hasNextPage    }  }  id}fragment StreamToggle_data on Project {  streamingLastUpdatedAt  id}fragment TracesTable_spans on Project {  ...SpanColumnSelector_evaluations  rootSpans: spans(first: 100, sort: {col: startTime, dir: desc}, rootSpansOnly: true, timeRange: $timeRange) {    edges {      rootSpan: node {        spanKind        name        metadata        statusCode: propagatedStatusCode        startTime        latencyMs        cumulativeTokenCountTotal        cumulativeTokenCountPrompt        cumulativeTokenCountCompletion        parentId        input {          value: truncatedValue        }        output {          value: truncatedValue        }        context {          spanId          traceId        }        spanEvaluations {          name          label          score        }        documentRetrievalMetrics {          evaluationName          ndcg          precision          hit        }        descendants {          spanKind          name          statusCode: propagatedStatusCode          startTime          latencyMs          parentId          cumulativeTokenCountTotal: tokenCountTotal          cumulativeTokenCountPrompt: tokenCountPrompt          cumulativeTokenCountCompletion: tokenCountCompletion          input {            value          }          output {            value          }          context {            spanId            traceId          }          spanEvaluations {            name            label            score          }          documentRetrievalMetrics {            evaluationName            ndcg            precision            hit          }        }      }      cursor      node {        __typename      }    }    pageInfo {      endCursor      hasNextPage    }  }  id}",
            variables: { "id": projectId, "timeRange": { "start": "2024-05-29T06:00:00.000Z", "end": "2025-06-05T06:00:00.000Z" } }
        })
        var requestOptions = {
            method: 'POST',
            headers,
            body: graphql,
            redirect: 'follow'
        };

        return fetch("/graphql", requestOptions)
            .then(response => response.json())
            .catch(error => console.log(error));
    }

    function waitForTableTracesExisting(timeoutSeconds) {
        let resolve, reject;
        let promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        })
        let startTime = performance.now()
        var $table = document.querySelector('table')
        let tid = setInterval(() => {
            var isTimeout = performance.now() - startTime > timeoutSeconds * 1000
            if (isTimeout) {
                clearInterval(tid)
                return reject('[TIMEOUT] waitForTableExisting')
            }
            $table = document.querySelector('table')
            if (!!$table) {
                clearInterval(tid)
                resolve($table)
            }
        }, 200)
        return promise
    }

    function appendColumn2thead(columnName) {
        var $theadTr = $table.querySelector("thead > tr")
        var $theadTdCloneNode = $theadTr.lastElementChild.cloneNode(true)
        $theadTdCloneNode.querySelector('div').innerText = columnName
        $theadTr.appendChild($theadTdCloneNode)
    }

    async function appendColumn2tbody(traces) {
        var $tbodyTrAll = $tbody.querySelectorAll('tr')
        let $dialog = null
        for (let i = 0, rows = $tbodyTrAll.length; i < rows; i++) {
            var $tr = $tbodyTrAll[i]
            var $tdCloneNode = $tr.querySelector('td:nth-child(1)').cloneNode(false)
            var name = $tr.querySelector('td:nth-child(2)').innerText
            var metadataStr = traces.find(item => item.rootSpan.name === name).rootSpan.metadata
            var metadata = JSON.parse(metadataStr)
            var labels = JSON.parse(metadata.optional_labels)

            metadata._labels = labels
            testCaseId = metadata.test_case_id

            let resp = await fetch(`${SERVICE_HOST}/jobRecords?id=${testCaseId}`).then(response => response.json());
            dialogLabels = resp[0].metadatas ? resp[0].metadatas.human_labels : metadata._labels

            displaySelectedLabels($tdCloneNode, dialogLabels);
            $tdCloneNode.classList.add(tampermonkeyTd)
            $tr.appendChild($tdCloneNode)

            $tbody.addEventListener('click', showDialog, { capture: true })
        }

        async function showDialog(e) {
            var el = e.target
            var isTampermonkeyTd = (element) => element.classList.contains(tampermonkeyTd)
            if (!isTampermonkeyTd(el)) {
                while (el.tagName !== 'TD') {
                    el = el.parentNode
                }
            }

            if (isTampermonkeyTd(el)) {
                e.preventDefault()
                e.stopPropagation();

                let rect = el.getBoundingClientRect()
                let left = rect.left + window.pageXOffset
                let top = rect.top + window.pageYOffset

                $curTbodyTd = el
                createDialog(dialogLabels, left - 100, top + 60);
            }
        }

        function createDialog(dialogLabels, left, top) {
            destroy$dialog()
            $dialog = document.createElement('div')
            $dialog.innerHTML = `
                <div
                    role="dialog"
                    tabindex="0"
                    data-ismodal="true"
                    class="ac-popover ac-popover--bottom is-open"
                    data-testid="popover"
                    data-is-open="true"
                >
                    <div style="min-width: 176px">
                    <div class="ac-view"
                        style="padding-top: var(--ac-global-dimension-size-50);padding-bottom: var(--ac-global-dimension-size-50);"
                    >
                        <ul>
                        ${dialogLabels.map(item => create$li(item.label, item.selected)).join('')}
                        </ul>
                        <div style="padding-bottom: 8px; border-bottom: 1px solid var(--ac-global-border-color-default);">
                        <input id="customInput" placeholder="Press Enter to add" />
                        </div>
                        <button id="submitBtn" style="float:right;margin: 6px 0;cursor: pointer">提交</button>
                    </div>
                    </div>
                </div>
            `
            $dialog.style = `position:absolute;z-index:99;left:${left}px;top:${top}px;padding:2px 10px;background-color: #000;border-radius: 8px;border: 1px solid #6a6a6a;`
            document.body.appendChild($dialog)

            $dialog.addEventListener('keyup', onEnter)
            $dialog.addEventListener('click', onSubmit)
            document.querySelector('#root').addEventListener('click', destroy$dialog)

            function onEnter(e) {
                if (e.target.id === 'customInput' && (e.key === 'Enter' || e.keyCode === 13)) {
                    let value = e.target.value.trim()
                    if (value === '') return;
                    var $ul = document.createElement('ul')
                    dialogLabels.push({ label: value, selected: true })
                    $ul.innerHTML = create$li(value, true)
                    $dialog.querySelector('ul').append($ul.firstElementChild)
                    e.target.value = ''
                    $ul = null
                }
            }

            async function onSubmit(e) {
                if (e.target.id === 'submitBtn') {
                    var $list = $dialog.querySelectorAll('ul > li')
                    for (let i = 0, len = $list.length; i < len; i++) {
                        dialogLabels[i].selected = $list[i].querySelector('input').checked
                    }

                    var headers = new Headers();
                    headers.append("Content-Type", "application/json");
                    var requestOptions = {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ human_labels: dialogLabels }),
                        redirect: 'follow'
                    };

                    await fetch(`${SERVICE_HOST}/jobRecords/metadata?id=${testCaseId}`, requestOptions)

                    $curTbodyTd.innerHTML = ''
                    displaySelectedLabels($curTbodyTd, dialogLabels)
                    destroy$dialog()
                }
            }

            function create$li(option, checked) {
                return `
                    <li style="padding: 4px 0">
                    <label>
                        <input type="checkbox" name="input_value" ${checked ? "checked" : ""}/>${option}
                    </label>
                    </li>`
            }

            function destroy$dialog() {
                if (!!$dialog) {
                    $dialog.removeEventListener('keyup', onEnter)
                    $dialog.removeEventListener('click', onSubmit)
                    document.querySelector('#root').removeEventListener('click', destroy$dialog)
                    $dialog.remove()
                    $dialog = null
                }
            }
        }

        function displaySelectedLabels($td, dialogLabels) {
            let hasSelected = dialogLabels.some(item => !!item.selected)
            if (!hasSelected) {
                $td.innerText = "N/A"
                return
            }
            for (let i = 0, len = dialogLabels.length; i < len; i++) {
                if (dialogLabels[i].selected) {
                    var $label = $table.querySelector('.ac-label').cloneNode()
                    $label.innerText = dialogLabels[i].label
                    $label.style.margin = '2px'
                    $td.append($label)
                }
            }
        }
    }
})();