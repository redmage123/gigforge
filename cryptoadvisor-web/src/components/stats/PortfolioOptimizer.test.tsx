import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import PortfolioOptimizer from "./PortfolioOptimizer"

const series = {
  BTC: Array.from({ length: 60 }, (_, i) => 50000 * Math.exp(0.001 * i)),
  ETH: Array.from({ length: 60 }, (_, i) => 3000 * Math.exp(0.0008 * i)),
  SOL: Array.from({ length: 60 }, (_, i) => 150 * Math.exp(0.0012 * i)),
}

describe("PortfolioOptimizer", () => {
  it("shows the four optimization strategies", () => {
    render(<PortfolioOptimizer series={series} />)
    expect(screen.getByText("Tangency (max Sharpe)")).toBeInTheDocument()
    expect(screen.getByText("Minimum Variance")).toBeInTheDocument()
    expect(screen.getByText("Risk Parity")).toBeInTheDocument()
    expect(screen.getByText("Quantum-annealed")).toBeInTheDocument()
  })

  it("shows the honest framing note about quantum annealing", () => {
    render(<PortfolioOptimizer series={series} />)
    expect(screen.getByText(/Honest framing/i)).toBeInTheDocument()
  })

  it("handles empty series", () => {
    render(<PortfolioOptimizer series={{}} />)
    expect(screen.getByText("Select assets to optimize.")).toBeInTheDocument()
  })
})

import { fireEvent } from "@testing-library/react"

describe("PortfolioOptimizer iterations control", () => {
  it("re-runs the annealer when iterations changes", () => {
    render(<PortfolioOptimizer series={series} />)
    const input = screen.getByLabelText(/Iterations/i) as HTMLInputElement
    expect(input.value).toBe("1000")
    fireEvent.change(input, { target: { value: "500" } })
    expect(input.value).toBe("500")
  })
})
