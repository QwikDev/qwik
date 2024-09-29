// import qwik-testing methods
import { screen, render, waitFor } from "@noma.to/qwik-testing-library";
// import the userEvent methods to interact with the DOM
import { userEvent } from "@testing-library/user-event";
// import the component to be tested
import { ExampleTest } from "./example";

// describe the test suite
describe("<ExampleTest />", () => {
  // describe the test case
  it("should increment the counter", async () => {
    // render the component into the DOM
    await render(<ExampleTest />);

    // retrieve the 'increment count' button
    const incrementBtn = screen.getByRole("button", {
      name: /increment counter/i,
    });
    // click the button twice
    await userEvent.click(incrementBtn);
    await userEvent.click(incrementBtn);

    // assert that the counter is now 2
    await waitFor(() =>
      expect(screen.getByText(/count:2/i)).toBeInTheDocument(),
    );
  });
});
