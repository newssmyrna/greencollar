"""Local Playwright smoke for the worker stop-deferral preview.
Requires Python Playwright and /usr/bin/chromium; serves the Expo export on localhost:8767.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8767'


def route_metric(page, label):
    return page.get_by_text(label, exact=True).locator('xpath=..').inner_text().splitlines()[0]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    js_errors = []
    external_requests = []
    page.on('pageerror', lambda error: js_errors.append(str(error)))
    page.on('request', lambda request: external_requests.append(request.url)
            if not request.url.startswith((URL, 'blob:', 'data:')) else None)
    page.goto(URL, wait_until='networkidle')
    page.evaluate('localStorage.clear()')
    page.reload(wait_until='networkidle')

    page.get_by_role('button', name='Worker', exact=True).click()
    assert 'Start your day.' in page.locator('body').inner_text()
    assert 'EST. RETURN' in page.locator('body').inner_text()
    start_time = page.get_by_role('textbox', name='Chosen local start time (24-hour)')
    page.get_by_role('radio', name='60 minutes').click()
    start_time.fill('11:15')
    assert 'No feasible lunch slot' in page.locator('body').inner_text()
    assert page.get_by_role('button', name='Start my day', exact=True).is_disabled(), 'a lunch conflict blocks day start'
    start_time.fill('08:00')
    page.get_by_role('radio', name='30 minutes').click()
    assert not page.get_by_role('button', name='Start my day', exact=True).is_disabled()
    return_30 = route_metric(page, 'EST. RETURN')
    page.get_by_role('radio', name='60 minutes').click()
    return_60 = route_metric(page, 'EST. RETURN')
    assert return_60 != return_30, '60-minute lunch changes the return estimate'
    page.get_by_role('radio', name='30 minutes').click()
    page.get_by_role('radio', name='+15 min').click()
    return_delayed = route_metric(page, 'EST. RETURN')
    assert return_delayed != return_30, 'delay allowance changes the return estimate'
    page.get_by_role('radio', name='No delay').click()
    page.screenshot(path=str(ROOT / 'phone-start-of-day.png'), full_page=True)
    page.get_by_role('button', name='Start my day', exact=True).click()
    assert 'Next stop.' in page.locator('body').inner_text()
    assert '12 min sample drive' in page.locator('body').inner_text()
    assert '8:12 AM estimated service start' in page.locator('body').inner_text(), 'service start includes the depot-to-stop leg'
    assert page.get_by_role('button', name='Start visit timer', exact=True).count() == 0
    page.screenshot(path=str(ROOT / 'phone-first-stop.png'), full_page=True)

    # Complete two sample visits so the selected lunch stop is the next stop and can be deferred.
    for index in range(2):
        page.get_by_role('button', name='Begin sample travel', exact=True).click()
        page.get_by_role('button', name='Confirm sample arrival', exact=True).click()
        page.get_by_role('button', name='Start visit timer', exact=True).click()
        page.get_by_role('button', name='Finish visit', exact=True).click()
        page.get_by_role('button', name='Finish visit', exact=True).last.click()
        if index == 0:
            assert 'Pool service' in page.locator('body').inner_text()
            assert '14 min sample drive' in page.locator('body').inner_text(), 'next stop shows inter-stop drive time'
    assert 'Property cleanup' in page.locator('body').inner_text()
    before_cancel = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert len(before_cancel['visits']) == 2

    page.get_by_role('button', name='Defer this stop', exact=True).click()
    assert page.get_by_text('Defer this stop?', exact=True).is_visible()
    page.screenshot(path=str(ROOT / 'phone-defer-confirmation.png'), full_page=True)
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_text('Defer this stop?', exact=True).wait_for(state='hidden')
    after_cancel = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert after_cancel.get('deferredStops', []) == [], 'cancel leaves local workday state unchanged'
    assert len(after_cancel['visits']) == 2

    page.get_by_role('button', name='Defer this stop', exact=True).click()
    page.get_by_role('radio', name='Other').click()
    page.get_by_role('button', name='Defer stop', exact=True).click()
    assert 'Add a short note for Other.' in page.locator('body').inner_text()
    page.get_by_role('textbox', name='Deferral note, required').fill('Weather safety hold')
    page.get_by_role('button', name='Defer stop', exact=True).click()
    page.get_by_text('Defer this stop?', exact=True).wait_for(state='hidden')
    assert 'Deferred stops' in page.locator('body').inner_text()
    assert 'Weather safety hold' in page.locator('body').inner_text()
    state_after_defer = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert state_after_defer['deferredStops'][0]['visitId'] == state_after_defer['plannedVisitIds'][2]
    assert state_after_defer['lunchAfterVisitId'] == state_after_defer['plannedVisitIds'][1], 'lunch moves to the last remaining stop'
    assert 'Unavailable · current position · Stop 2' in page.locator('body').inner_text(), 'the rescheduled lunch shows its feasibility conflict at the latest completed stop'
    assert state_after_defer['visits'] == before_cancel['visits'], 'completed visit snapshots are preserved'
    assert len(state_after_defer['plannedVisitIds']) == 3, 'deferred visit remains assigned'
    page.get_by_text('Deferred stops', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'phone-deferred-stops.png'))
    page.get_by_text('Map & route estimate', exact=True).evaluate("node => node.scrollIntoView({block: 'center', inline: 'nearest'})")
    page.wait_for_timeout(150)
    page.screenshot(path=str(ROOT / 'phone-deferred-route.png'), full_page=True)

    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Worker', exact=True).click()
    page.get_by_role('button', name='Continue my day', exact=True).click()
    assert 'Weather safety hold' in page.locator('body').inner_text(), 'deferred reason survives reload'
    page.get_by_role('button', name='Restore this stop', exact=True).click()
    assert page.get_by_text('Deferred stops', exact=True).count() == 0
    assert 'Property cleanup' in page.locator('body').inner_text()
    restored = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert restored.get('deferredStops', []) == []
    assert restored['lunchAfterVisitId'] == restored['plannedVisitIds'][2], f"undo restores prior lunch: {restored['lunchAfterVisitId']} vs {restored['plannedVisitIds'][2]}"
    assert restored['visits'] == before_cancel['visits'], 'undo preserves completed visit snapshots'
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.screenshot(path=str(ROOT / 'desktop-restored-route.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'desktop has no horizontal overflow'

    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Begin sample travel', exact=True).click()
    assert page.get_by_role('button', name='Defer this stop', exact=True).is_visible(), 'defer remains available while traveling'
    page.get_by_role('button', name='Defer this stop', exact=True).click()
    page.get_by_role('button', name='Defer stop', exact=True).click()
    page.get_by_text('Defer this stop?', exact=True).wait_for(state='hidden')
    in_transit_defer = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert in_transit_defer['travelingVisitId'] is None, 'deferral clears the in-progress travel leg'
    assert in_transit_defer['routePositionLocationId'] == 'preview-location-3', 'deferral keeps a local sample position'
    page.get_by_role('button', name='Restore this stop', exact=True).click()
    page.get_by_role('button', name='Begin sample travel', exact=True).click()
    page.get_by_role('button', name='Confirm sample arrival', exact=True).click()
    assert page.get_by_role('button', name='Defer this stop', exact=True).is_visible(), 'defer remains available after sample arrival'
    page.get_by_role('button', name='Defer this stop', exact=True).click()
    page.get_by_role('button', name='Defer stop', exact=True).click()
    page.get_by_text('Defer this stop?', exact=True).wait_for(state='hidden')
    onsite_defer = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert onsite_defer['arrivedVisitId'] is None, 'deferral clears the sample arrival state'
    assert onsite_defer['travelingVisitId'] is None
    assert onsite_defer['routePositionLocationId'] == 'preview-location-3'

    assert not js_errors, f'JavaScript errors: {js_errors}'
    assert not external_requests, f'unexpected external requests: {external_requests}'
    print('PASS: lunch and delay recalculate finish; next-stop start includes drive time')
    print('PASS: cancel; Other-reason note validation; defer; reason and completed visits persist; lunch reschedules; undo restores prior lunch')
    print('PASS: defer while traveling and after arrival; both transitions clear the old leg and retain local sample route position')
    print(f'PASS: {len(js_errors)} browser JavaScript errors; {len(external_requests)} external requests')
    print(f'PASS: phone and desktop screenshots saved under {ROOT}')
    browser.close()
