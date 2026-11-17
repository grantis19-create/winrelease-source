import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenshotGallery } from './ScreenshotGallery'

const shots = [
  { src: '/a.jpg', alt: 'First screen', caption: 'First caption.', width: 100, height: 50, thumbAspect: 2 },
  { src: '/b.jpg', alt: 'Second screen', caption: 'Second caption.', width: 100, height: 50, thumbAspect: 2 },
]

describe('ScreenshotGallery', () => {
  it('opens a screen full size, moves with the arrow keys and closes with Escape', () => {
    render(<ScreenshotGallery shots={shots} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge: First screen' }))
    expect(screen.getByRole('dialog', { name: 'First screen' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'Second screen' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes from the close button', () => {
    render(<ScreenshotGallery shots={shots} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge: Second screen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a visible Enlarge button on each screen and a visible Close button in the popout', () => {
    render(<ScreenshotGallery shots={shots} />)
    expect(screen.getAllByText('Enlarge')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge: First screen' }))
    expect(screen.getByRole('button', { name: 'Close' }).textContent).toContain('Close')
  })

  it('closes when the dimmed area around the popout is clicked, but not when the popout itself is', () => {
    render(<ScreenshotGallery shots={shots} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge: First screen' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByAltText('First screen'))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
