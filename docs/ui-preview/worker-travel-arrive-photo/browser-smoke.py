"""Manual local-browser smoke for the GreenCollar worker travel/visit preview.
Requires Python Playwright and /usr/bin/chromium; serves the Expo export on localhost:8766.
"""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8766'
sample_image = Image.new('RGB', (240, 150), '#b9dce5')
draw = ImageDraw.Draw(sample_image)
draw.rectangle((0, 82, 240, 150), fill='#739d63')
draw.rectangle((20, 47, 81, 83), fill='#d6c194')
draw.polygon((12, 48, 50, 18, 89, 48), fill='#52785b')
draw.rectangle((155, 42, 207, 83), fill='#eee1c6')
draw.polygon((148, 43, 181, 15, 214, 43), fill='#557b5d')
image_buffer = BytesIO()
sample_image.save(image_buffer, format='PNG')
PNG = image_buffer.getvalue()

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
    page.get_by_role('button', name='Start my day', exact=True).click()
    assert 'Next stop.' in page.locator('body').inner_text()
    assert '12 min sample drive' in page.locator('body').inner_text()
    assert page.get_by_role('button', name='Start visit timer', exact=True).count() == 0
    page.get_by_role('button', name='Begin sample travel', exact=True).click()
    assert 'EN ROUTE · SAMPLE' in page.locator('body').inner_text()
    assert page.get_by_role('button', name='Start visit timer', exact=True).count() == 0
    page.get_by_role('button', name='Confirm sample arrival', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'phone-en-route.png'))

    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Worker', exact=True).click()
    assert 'DAY IN PROGRESS' in page.locator('body').inner_text()
    page.get_by_role('button', name='Continue my day', exact=True).click()
    assert 'EN ROUTE · SAMPLE' in page.locator('body').inner_text(), 'travel state survives reload'
    page.get_by_role('button', name='Confirm sample arrival', exact=True).click()
    assert 'Sample arrival confirmed' in page.locator('body').inner_text()
    page.get_by_role('button', name='Start visit timer', exact=True).click()
    note = page.get_by_role('textbox', name='Optional work note')
    note.fill('Gate code confirmed; front beds completed.')
    assert 'Gate code confirmed; front beds completed.' in page.evaluate("localStorage.getItem('greencollar.preview.workspace.v2')")
    with page.expect_file_chooser() as chooser_event:
        page.get_by_role('button', name='Add a local sample photo', exact=True).click()
    chooser_event.value.set_files({'name': 'before.png', 'mimeType': 'image/png', 'buffer': PNG})
    page.get_by_text('before.png', exact=True).wait_for()
    with page.expect_file_chooser() as chooser_event:
        page.get_by_role('button', name='Add a local sample photo', exact=True).click()
    chooser_event.value.set_files({'name': 'after.png', 'mimeType': 'image/png', 'buffer': PNG})
    page.get_by_text('2/2 SAMPLE', exact=True).wait_for()
    assert page.get_by_role('button', name='Add a local sample photo', exact=True).is_disabled()
    page.get_by_role('button', name='Remove sample photo after.png', exact=True).click()
    page.get_by_text('1/2 SAMPLE', exact=True).wait_for()
    assert page.get_by_text('after.png', exact=True).count() == 0
    assert 'No upload, GPS tag, or customer message is sent.' in page.locator('body').inner_text()
    page.get_by_text('Visit photos', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'phone-active-with-note-photo.png'))

    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('textbox', name='Optional work note').scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'desktop-active-with-note-photo.png'))
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Worker', exact=True).click()
    page.get_by_role('button', name='Continue my day', exact=True).click()
    assert page.get_by_role('textbox', name='Optional work note').input_value() == 'Gate code confirmed; front beds completed.'
    assert page.get_by_text('before.png', exact=True).count() == 1, 'photo survives reload'
    page.get_by_role('button', name='Pause visit timer', exact=True).click()
    assert 'VISIT TIMER PAUSED' in page.locator('body').inner_text()
    page.get_by_role('button', name='Resume visit timer', exact=True).click()
    assert 'VISIT TIMER RUNNING' in page.locator('body').inner_text()
    page.get_by_role('button', name='Finish visit', exact=True).click()
    assert page.get_by_text('Finish this visit?', exact=True).is_visible()
    page.get_by_role('button', name='Finish visit', exact=True).last.click()
    assert 'Visit marked complete' in page.locator('body').inner_text()
    page.get_by_text('Finish this visit?', exact=True).wait_for(state='hidden')
    assert page.get_by_text('before.png', exact=True).count() == 1, 'photo remains visible after completion'
    assert 'Pool service' in page.locator('body').inner_text()
    assert '14 min sample drive' in page.locator('body').inner_text(), 'next stop shows inter-stop drive estimate'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Begin sample travel', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'phone-next-stop.png'))
    page.get_by_role('button', name='Begin sample travel', exact=True).click()
    assert 'EN ROUTE · SAMPLE' in page.locator('body').inner_text()

    assert not js_errors, f'JavaScript errors: {js_errors}'
    assert not external_requests, f'unexpected external requests: {external_requests}'
    print('PASS: start day → sample travel → reload → arrival → timer → note/photo → reload → pause/resume → complete → next stop → travel')
    print(f'PASS: {len(js_errors)} browser JavaScript errors; {len(external_requests)} external requests')
    print(f'PASS: screenshots saved under {ROOT}')
    browser.close()
