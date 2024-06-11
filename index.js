(async function () {
    'use strict';

    let matches = window.location.pathname.match(/^\/projects\/([^?&/]+)/)
    let projectId = matches ? matches[1] : ""
    let testCaseId = null;
    let tampermonkeyTd = "_tampermonkeyTd"
    let SERVICE_HOST = 'http://localhost:3000'

    let rangDefault = getDateRange(-7)
    let traces = await fetchGraphqlData(projectId, rangDefault.start, rangDefault.end);

    let $table = await waitForTableTracesExisting(10)
    let $tbody = $table.querySelector('tbody')
    let $curTbodyTd = null
    let dialogLabels = null

    appendColumn2thead('labels')
    appendColumn2tbody(traces)
    document.addEventListener('click', onDateRangeChange(), { capture: true })

    function onDateRangeChange() {
        let dateRange = {
            "Last Day": -1,
            "Last 7 Days": -7,
            "Last Month": -30
        }
        let currentDateRange = "Last 7 Days"
        return async function (e) {
            const $menu = document.querySelector('.ac-menu')
            if ($menu && $menu.contains(e.target)) {
                let el = e.target
                while (!el.classList.contains('ac-menu-item')) {
                    el = el.parentNode
                }
                if (el.textContent === currentDateRange) {
                    return
                }
                let selectedDateRangeText = el.textContent
                currentDateRange = selectedDateRangeText
                if (selectedDateRangeText === 'All Time') {
                    let tomorrow = getDateRange(1).end
                    traces = await fetchGraphqlData(projectId, '1970-12-31T16:00:00.000Z', tomorrow)
                } else {
                    const {start, end} = getDateRange(dateRange[selectedDateRangeText])
                    traces = await fetchGraphqlData(projectId, start, end)
                }

                console.log('sleep 1s')
                await sleep(1)
                $table = document.querySelector('table')
                $tbody = $table.querySelector('tbody')
                appendColumn2tbody(traces)
            }
        }

    }

    function sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000))
    }

    function getDateRange(daysAgo) {
        const end = new Date();
        const start = new Date(end.getTime() + (daysAgo * 24 * 60 * 60 * 1000));
        return {start: start.toISOString(), end: end.toISOString()}
    }

    function fetchGraphqlData(projectId, start, end) {
        let headers = new Headers();
        headers.append("Content-Type", "application/json");
        let graphql = JSON.stringify({
            query: "query ProjectPageQuery( $id: GlobalID!  $timeRange: TimeRange!) {  project: node(id: $id) {    __typename    ...SpansTable_spans    ...TracesTable_spans    ...ProjectPageHeader_stats    ...StreamToggle_data    __isNode: __typename    id  }}fragment ProjectPageHeader_stats on Project {  traceCount(timeRange: $timeRange)  tokenCountTotal(timeRange: $timeRange)  latencyMsP50: latencyMsQuantile(probability: 0.5, timeRange: $timeRange)  latencyMsP99: latencyMsQuantile(probability: 0.99, timeRange: $timeRange)  spanEvaluationNames  documentEvaluationNames  id}fragment SpanColumnSelector_evaluations on Project {  spanEvaluationNames}fragment SpansTable_spans on Project {  ...SpanColumnSelector_evaluations  spans(first: 100, sort: {col: startTime, dir: desc}, timeRange: $timeRange) {    edges {      span: node {        spanKind        name        metadata        statusCode        startTime        latencyMs        tokenCountTotal        tokenCountPrompt        tokenCountCompletion        context {          spanId          traceId        }        input {          value: truncatedValue        }        output {          value: truncatedValue        }        spanEvaluations {          name          label          score        }        documentRetrievalMetrics {          evaluationName          ndcg          precision          hit        }      }      cursor      node {        __typename      }    }    pageInfo {      endCursor      hasNextPage    }  }  id}fragment StreamToggle_data on Project {  streamingLastUpdatedAt  id}fragment TracesTable_spans on Project {  ...SpanColumnSelector_evaluations  rootSpans: spans(first: 100, sort: {col: startTime, dir: desc}, rootSpansOnly: true, timeRange: $timeRange) {    edges {      rootSpan: node {        spanKind        name        metadata        statusCode: propagatedStatusCode        startTime        latencyMs        cumulativeTokenCountTotal        cumulativeTokenCountPrompt        cumulativeTokenCountCompletion        parentId        input {          value: truncatedValue        }        output {          value: truncatedValue        }        context {          spanId          traceId        }        spanEvaluations {          name          label          score        }        documentRetrievalMetrics {          evaluationName          ndcg          precision          hit        }        descendants {          spanKind          name          statusCode: propagatedStatusCode          startTime          latencyMs          parentId          cumulativeTokenCountTotal: tokenCountTotal          cumulativeTokenCountPrompt: tokenCountPrompt          cumulativeTokenCountCompletion: tokenCountCompletion          input {            value          }          output {            value          }          context {            spanId            traceId          }          spanEvaluations {            name            label            score          }          documentRetrievalMetrics {            evaluationName            ndcg            precision            hit          }        }      }      cursor      node {        __typename      }    }    pageInfo {      endCursor      hasNextPage    }  }  id}",
            variables: { "id": projectId, "timeRange": { start, end } }
        })
        let requestOptions = {
            method: 'POST',
            headers,
            body: graphql,
            redirect: 'follow'
        };

        return fetch("/graphql", requestOptions)
            .then(response => response.json())
            .then(json => json.data.project.rootSpans.edges)
            .catch(console.error);
    }

    function waitForTableTracesExisting(timeoutSeconds) {
        let resolve, reject;
        let promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        })
        let startTime = performance.now()
        let $table = document.querySelector('table')
        let tid = setInterval(() => {
            let isTimeout = performance.now() - startTime > timeoutSeconds * 1000
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
        let $theadTr = $table.querySelector("thead > tr")
        let $theadTdCloneNode = $theadTr.lastElementChild.cloneNode(true)
        $theadTdCloneNode.querySelector('div').innerText = columnName
        $theadTr.appendChild($theadTdCloneNode)
    }

    async function appendColumn2tbody(traces) {
        if ($tbody.classList.contains('is-empty')) {
            return
        }
        let $tbodyTrAll = $tbody.querySelectorAll('tr')
        let $dialog = null

        $tbody.addEventListener('click', showDialog, { capture: true })
        for (let i = 0, rows = $tbodyTrAll.length; i < rows; i++) {
            let $tr = $tbodyTrAll[i]
            let $tdCloneNode = $tr.querySelector('td:nth-child(1)').cloneNode(false)
            let name = $tr.querySelector('td:nth-child(2)').innerText
            /*let metadataStr = traces.find(item => item.rootSpan.name === name).rootSpan.metadata;
            let metadata = JSON.parse(metadataStr)
            let labels = JSON.parse(metadata.optional_labels)

            metadata._labels = labels
            testCaseId = metadata.test_case_id

            let resp = await fetch(`${SERVICE_HOST}/jobRecords?id=${testCaseId}`).then(response => response.json());
            debugger
            dialogLabels = resp[0].metadatas ? resp[0].metadatas.human_labels : metadata._labels
*/
            dialogLabels = await getDialogLabels(name)
            displaySelectedLabels($tdCloneNode, dialogLabels);
            $tdCloneNode.classList.add(tampermonkeyTd)
            if ($tr.querySelector('.' + tampermonkeyTd)) {
                $tr.querySelector('.' + tampermonkeyTd).remove()
            }
            $tr.appendChild($tdCloneNode)
        }

        async function getDialogLabels(name) {
            let metadataStr = traces.find(item => item.rootSpan.name === name).rootSpan.metadata;
            let metadata = JSON.parse(metadataStr)
            let labels = JSON.parse(metadata.optional_labels)

            metadata._labels = labels
            testCaseId = metadata.test_case_id

            let resp = await fetch(`${SERVICE_HOST}/jobRecords?id=${testCaseId}`).then(response => response.json());
            dialogLabels = resp[0].metadatas ? resp[0].metadatas.human_labels : metadata._labels
            return dialogLabels
        }

        async function showDialog(e) {
            let el = e.target
            let isTampermonkeyTd = (element) => element.classList.contains(tampermonkeyTd)
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
                let name = $curTbodyTd.parentElement.querySelector("td:nth-child(2)").textContent
                dialogLabels = await getDialogLabels(name)
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
                      <div class="ac-view" style="padding: 4px 0">
                        <ul>
                          ${dialogLabels.map(item => create$li(item.label, item.selected)).join('')}
                        </ul>
                        <div style="padding-bottom: 8px; border-bottom: 1px solid #6a6a6a">
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
                    let $ul = document.createElement('ul')
                    dialogLabels.push({ label: value, selected: true })
                    $ul.innerHTML = create$li(value, true)
                    $dialog.querySelector('ul').append($ul.firstElementChild)
                    e.target.value = ''
                    $ul = null
                }
            }

            async function onSubmit(e) {
                if (e.target.id === 'submitBtn') {
                    let $list = $dialog.querySelectorAll('ul > li')
                    for (let i = 0, len = $list.length; i < len; i++) {
                        dialogLabels[i].selected = $list[i].querySelector('input').checked
                    }

                    let headers = new Headers();
                    headers.append("Content-Type", "application/json");
                    let requestOptions = {
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
                    let $label = $table.querySelector('.ac-label').cloneNode()
                    $label.innerText = dialogLabels[i].label
                    $label.style.margin = '2px'
                    $td.append($label)
                }
            }
        }
    }
})();
