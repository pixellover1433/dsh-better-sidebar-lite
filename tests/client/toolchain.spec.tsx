import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import styles from './toolchain.module.css'

describe('client toolchain', () => {
  it('renders a component under jsdom with CSS modules', () => {
    render(<div data-testid="probe" className={styles.probe}>probe</div>)
    expect(screen.getByTestId('probe')).toBeTruthy()
  })
})
