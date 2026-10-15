"""Local browser acceptance for the compact GreenCollar worker-day preview.
Run the Expo export on localhost:8773, then run this script from any directory.
"""
from base64 import b64decode
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8773'
# A valid 1x1 PNG fixture; it remains local and is never uploaded.
PIXEL_PNG = b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Vb8AAAAASUVORK5CYII=')


def metric_value(page, label):
    return page.get_by_text(label, exact=True).last.locator('xpath=..').inner_text().splitlines()[0]


def scroll_all_to_top(page):
    page.evaluate("""() => {
      for (const element of document.querySelectorAll('*')) {
        const style = getComputedStyle(element);
        if (element.scrollHeight > element.clientHeight + 10 && /(auto|scroll)/.test(style.overflowY)) element.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    }""")


def assert_pinned_action(page, name):
    action = page.get_by_role('button', name=name, exact=True)
    assert action.is_visible(), f'{name} is not visible'
    box = action.bounding_box()
    assert box and box['y'] + box['height'] <= page.viewport_size['height'] + 1, f'{name} is below the visible viewport: {box}'
    if page.viewport_size['width'] < 920:
        nav = page.get_by_role('button', name='Reset sample data', exact=True).bounding_box()
        assert nav and box['y'] + box['height'] <= nav['y'] + 1, f'{name} overlaps bottom navigation: action={box}, nav={nav}'
    return box


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
    assert_pinned_action(page, 'Start my day')
    page.screenshot(path=str(ROOT / 'phone-start-of-day.png'))

    page.get_by_role('button', name='Review route, lunch & delays', exact=True).click()
    assert page.get_by_text('Map & route estimate', exact=True).is_visible()
    assert page.get_by_role('textbox', name='Chosen local start time (24-hour)').is_visible()
    return_30 = metric_value(page, 'EST. RETURN')
    page.get_by_role('radio', name='60 minutes').click()
    return_60 = metric_value(page, 'EST. RETURN')
    assert return_60 != return_30, '60-minute lunch changes the estimated depot return'
    page.get_by_role('radio', name='30 minutes').click()
    page.get_by_role('radio', name='+15 min').click()
    return_delayed = metric_value(page, 'EST. RETURN')
    assert return_delayed != return_30, 'a delay changes the estimated depot return'
    page.get_by_role('radio', name='No delay').click()
    scroll_all_to_top(page)
    page.screenshot(path=str(ROOT / 'phone-route-lunch-sheet.png'))
    start_time = page.get_by_role('textbox', name='Chosen local start time (24-hour)')
    page.get_by_role('radio', name='60 minutes').click()
    start_time.fill('11:15')
    assert page.get_by_text('No feasible lunch slot', exact=True).is_visible()
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)
    assert page.get_by_role('button', name='Start my day', exact=True).is_disabled(), 'a lunch conflict blocks day start'
    page.get_by_role('button', name='Review route, lunch & delays', exact=True).click()
    page.get_by_role('textbox', name='Chosen local start time (24-hour)').fill('08:00')
    page.get_by_role('radio', name='30 minutes').click()
    page.get_by_role('radio', name='No delay').click()
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)

    # Day start is separate from the first visit timer and ignores a fast repeat.
    page.get_by_role('button', name='Start my day', exact=True).dblclick()
    page.wait_for_timeout(250)
    state = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert state['dayStartedAt'] is not None and state['workSession'] is None
    expect(page.get_by_role('button', name='Begin sample travel', exact=True)).to_be_enabled()
    assert_pinned_action(page, 'Begin sample travel')
    assert 'Next stop.' in page.locator('body').inner_text()
    assert '12 min sample drive' in page.locator('body').inner_text()
    page.screenshot(path=str(ROOT / 'phone-first-stop.png'))

    # Contact details, route, and photos are reachable without scrolling the work card.
    page.get_by_role('button', name='Contact details', exact=True).click()
    assert page.get_by_text('Example Customer 1', exact=True).last.is_visible()
    assert page.get_by_text('No phone on this sample profile', exact=True).is_visible()
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)
    page.get_by_role('button', name='Route & lunch', exact=True).click()
    assert page.get_by_text('Map & route estimate', exact=True).is_visible()
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)
    page.get_by_role('button', name='Visit photos', exact=True).click()
    with page.expect_file_chooser() as chooser_info:
        page.get_by_role('button', name='Add a local sample photo', exact=True).click()
    chooser_info.value.set_files({'name': 'sample-pixel.png', 'mimeType': 'image/png', 'buffer': PIXEL_PNG})
    page.get_by_text('sample-pixel.png', exact=True).wait_for(state='visible', timeout=5000)
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)

    # A fast repeat travel tap cannot skip the separate arrival state.
    page.get_by_role('button', name='Begin sample travel', exact=True).dblclick()
    page.wait_for_timeout(250)
    assert_pinned_action(page, 'Confirm sample arrival')
    transit_state = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert transit_state['travelingVisitId'] and not transit_state['arrivedVisitId']

    # Cancel leaves data unchanged. The form can scroll on a keyboard-shortened phone,
    # while Cancel and Defer remain pinned and inside the visible viewport.
    before_cancel = transit_state
    page.get_by_role('button', name='Defer this stop', exact=True).click()
    page.get_by_role('radio', name='Other').click()
    note = page.get_by_role('textbox', name='Deferral note, required')
    note.focus()
    page.set_viewport_size({'width': 320, 'height': 340})
    note.scroll_into_view_if_needed()
    for name in ('Cancel', 'Defer stop'):
        box = page.get_by_role('button', name=name, exact=True).bounding_box()
        assert box and box['y'] >= 0 and box['y'] + box['height'] <= 340, f'{name} is hidden by the short viewport: {box}'
    page.wait_for_timeout(400)
    page.screenshot(path=str(ROOT / 'phone-deferral-short-keyboard.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    note.fill('')
    page.get_by_role('button', name='Defer stop', exact=True).click()
    assert 'Add a short note for Other.' in page.locator('body').inner_text()
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.wait_for_timeout(250)
    canceled = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert canceled['deferredStops'] == before_cancel['deferredStops'] and canceled['travelingVisitId'] == before_cancel['travelingVisitId']

    # Defer during travel, keep assignment/history, show the stop in Route, and restore it.
    page.get_by_role('button', name='Defer this stop', exact=True).click()
    page.get_by_role('radio', name='Other').click()
    page.get_by_role('textbox', name='Deferral note, required').fill('Weather safety hold')
    page.get_by_role('button', name='Defer stop', exact=True).click()
    page.wait_for_timeout(250)
    deferred = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert deferred['travelingVisitId'] is None and deferred['routePositionLocationId'] == 'preview-location-1'
    assert len(deferred['plannedVisitIds']) == 3 and deferred['deferredStops'][0]['note'] == 'Weather safety hold'
    page.get_by_role('button', name='Route & lunch', exact=True).click()
    assert page.get_by_text('Deferred stops', exact=True).is_visible()
    assert page.get_by_text('Weather safety hold', exact=False).is_visible()
    page.screenshot(path=str(ROOT / 'phone-deferred-route-sheet.png'))
    page.get_by_role('button', name='Restore this stop', exact=True).click()
    page.wait_for_timeout(250)
    restored = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert restored['deferredStops'] == [] and restored['travelingVisitId'] is None
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)

    # Travel, arrival, timer, note, pause/resume, completion cancel/confirm, then reload.
    page.get_by_role('button', name='Begin sample travel', exact=True).click()
    page.get_by_role('button', name='Confirm sample arrival', exact=True).click()
    assert_pinned_action(page, 'Start visit timer')
    page.get_by_role('button', name='Start visit timer', exact=True).click()
    assert_pinned_action(page, 'Pause visit timer')
    scroll_all_to_top(page)
    page.screenshot(path=str(ROOT / 'phone-active-visit.png'))
    page.get_by_role('button', name='Work note', exact=True).click()
    page.get_by_role('textbox', name='Optional work note').fill('Gate code confirmed in sample')
    page.get_by_role('button', name='Close worker details').click()
    page.wait_for_timeout(250)
    active_state = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert active_state['workSession']['note'] == 'Gate code confirmed in sample'
    scroll_all_to_top(page)
    page.screenshot(path=str(ROOT / 'phone-active-visit.png'))
    page.get_by_role('button', name='Pause visit timer', exact=True).click()
    assert_pinned_action(page, 'Resume visit timer')
    page.get_by_role('button', name='Resume visit timer', exact=True).click()
    page.get_by_role('button', name='Finish visit', exact=True).first.click()
    assert page.get_by_text('Finish this visit?', exact=True).is_visible()
    page.get_by_role('button', name='Go back', exact=True).click()
    page.get_by_role('button', name='Finish visit', exact=True).first.click()
    page.get_by_role('button', name='Finish visit', exact=True).last.click()
    page.wait_for_timeout(250)
    after_finish = page.evaluate("JSON.parse(localStorage.getItem('greencollar.preview.workspace.v2')).workdays[0]")
    assert after_finish['visits'][0]['status'] == 'completed'
    assert 'Pool service' in page.locator('body').inner_text()
    assert '14 min sample drive' in page.locator('body').inner_text()
    assert len(after_finish['photosByVisitId'][after_finish['plannedVisitIds'][0]]) == 1

    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Worker', exact=True).click()
    page.get_by_role('button', name='Continue my day', exact=True).click()
    assert '1 complete' in page.locator('body').inner_text()
    assert_pinned_action(page, 'Begin sample travel')

    # Compact phone and desktop layout checks for action visibility and overflow.
    page.set_viewport_size({'width': 320, 'height': 568})
    page.wait_for_timeout(200)
    assert_pinned_action(page, 'Begin sample travel')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'compact phone has horizontal overflow'
    page.screenshot(path=str(ROOT / 'phone-compact-stop.png'))
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.wait_for_timeout(200)
    assert_pinned_action(page, 'Begin sample travel')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'desktop has horizontal overflow'
    page.screenshot(path=str(ROOT / 'desktop-next-stop.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.add_style_tag(content='[dir="auto"] { font-size: 150% !important; line-height: 1.35 !important; }')
    page.wait_for_timeout(200)
    assert_pinned_action(page, 'Begin sample travel')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'enlarged text has horizontal overflow'
    page.screenshot(path=str(ROOT / 'phone-enlarged-text.png'))

    assert not js_errors, f'Browser JavaScript errors: {js_errors}'
    assert not external_requests, f'Unexpected external requests: {external_requests}'
    print('PASS: start-of-day route, lunch, delay and return estimates recalculate in sheets')
    print('PASS: one visible state-specific action per worker stop; rapid repeated taps do not skip states')
    print('PASS: contacts, notes, and browser-local photos open and persist in the sample flow')
    print('PASS: defer cancel/Other validation, mid-travel deferral, route restore, and visit history preservation')
    print('PASS: deferral actions remain visible in a 320x340 keyboard-shortened viewport; scroll reaches note field')
    print('PASS: reload/continue restores day progress; 320x568 phone, 150% text enlargement, and desktop have no horizontal overflow')
    print(f'PASS: {len(js_errors)} JavaScript errors; {len(external_requests)} external requests')
    print(f'PASS: screenshots saved to {ROOT}')
    browser.close()
